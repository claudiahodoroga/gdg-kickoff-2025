const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");

const AZURE_CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER = process.env.BLOB_CONTAINER || "ctfdata";
const USERS_BLOB = "users.json";

async function getContainerClient() {
  if (!AZURE_CONN) throw new Error("Missing AZURE_STORAGE_CONNECTION_STRING");
  const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONN);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER);
  const exists = await containerClient.exists();
  if (!exists) await containerClient.create();
  return containerClient;
}

async function readJsonBlob(containerClient, blobName, defaultObj) {
  const blobClient = containerClient.getBlobClient(blobName);
  try {
    const exists = await blobClient.exists();
    if (!exists) {
      await blobClient.uploadData(Buffer.from(JSON.stringify(defaultObj, null, 2)), {
        blobHTTPHeaders: { blobContentType: "application/json" },
      });
      return defaultObj;
    }
    const downloadBlockBlobResponse = await blobClient.download();
    const downloaded = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
    return JSON.parse(downloaded.toString());
  } catch (err) {
    await blobClient.uploadData(Buffer.from(JSON.stringify(defaultObj, null, 2)), {
      blobHTTPHeaders: { blobContentType: "application/json" },
    });
    return defaultObj;
  }
}

async function writeJsonBlob(containerClient, blobName, obj) {
  const blobClient = containerClient.getBlobClient(blobName);
  await blobClient.uploadData(Buffer.from(JSON.stringify(obj, null, 2)), {
    blobHTTPHeaders: { blobContentType: "application/json" },
    overwrite: true,
  });
}

async function streamToBuffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (data) => chunks.push(data instanceof Buffer ? data : Buffer.from(data)));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

module.exports = async function (context, req) {
  context.log("Register endpoint hit");
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      context.res = { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' },
        body: "missing username or password"
      };
      return;
    }

    const containerClient = await getContainerClient();
    const usersObj = await readJsonBlob(containerClient, USERS_BLOB, { users: [] });

    const existing = usersObj.users.find((u) => u.username === username);
    if (existing) {
      context.res = { 
        status: 409, 
        headers: { 'Content-Type': 'application/json' },
        body: "username exists"
      };
      return;
    }

    const hash = crypto.createHash("sha256").update(password).digest("hex");

    const newUser = { username, hash, score: 0, claimedFlags: [] };
    usersObj.users.push(newUser);

    await writeJsonBlob(containerClient, USERS_BLOB, usersObj);

    context.res = { 
      status: 201, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: "ok" })
    };
  } catch (err) {
    context.log.error(err);
    context.res = { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' },
      body: "internal_error"
    };
  }
};