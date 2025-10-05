const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const AZURE_CONN = process.env.AZURE_CONN;
const CONTAINER = process.env.BLOB_CONTAINER || "ctfdata";
const USERS_BLOB = "users.json";
const JWT_SECRET = process.env.JWT_SECRET;

async function getContainerClient() {
  if (!AZURE_CONN) throw new Error("Missing AZURE_CONN");
  const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONN);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER);
  const exists = await containerClient.exists();
  if (!exists) await containerClient.create();
  return containerClient;
}

async function readJsonBlob(containerClient, blobName, defaultObj) {
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  try {
    const exists = await blockBlobClient.exists();
    if (!exists) {
      const data = JSON.stringify(defaultObj, null, 2);
      await blockBlobClient.upload(
        data,
        Buffer.byteLength(data),
        {
          blobHTTPHeaders: { blobContentType: "application/json" }
        }
      );
      return defaultObj;
    }
    const downloadBlockBlobResponse = await blockBlobClient.download();
    const downloaded = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
    return JSON.parse(downloaded.toString());
  } catch (err) {
    const data = JSON.stringify(defaultObj, null, 2);
    await blockBlobClient.upload(
      data,
      Buffer.byteLength(data),
      {
        blobHTTPHeaders: { blobContentType: "application/json" }
      }
    );
    return defaultObj;
  }
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
  context.log("Login endpoint hit");
  try {
    if (!JWT_SECRET) {
      context.res = { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' },
        body: "server_misconfigured"
      };
      return;
    }
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

    const user = usersObj.users.find((u) => u.username === username);
    if (!user) {
      context.res = { 
        status: 401, 
        headers: { 'Content-Type': 'application/json' },
        body: "invalid"
      };
      return;
    }

    const hash = crypto.createHash("sha256").update(password).digest("hex");
    if (hash !== user.hash) {
      context.res = { 
        status: 401, 
        headers: { 'Content-Type': 'application/json' },
        body: "invalid"
      };
      return;
    }

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "2h" });

    context.res = { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: "ok", token })
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