const { BlobServiceClient } = require("@azure/storage-blob");
const jwt = require("jsonwebtoken");

const AZURE_CONN = process.env.AZURE_CONN;
const CONTAINER = process.env.BLOB_CONTAINER || "ctfdata";
const USERS_BLOB = "users.json";
const FLAGS_BLOB = "flags.json";
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

async function writeJsonBlob(containerClient, blobName, obj) {
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const data = JSON.stringify(obj, null, 2);
  await blockBlobClient.upload(
    data,
    Buffer.byteLength(data),
    {
      blobHTTPHeaders: { blobContentType: "application/json" },
      overwrite: true
    }
  );
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
  context.log("SubmitFlag endpoint hit");
  try {
    if (!JWT_SECRET) {
      context.res = {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: "server_misconfigured"
      };
      return;
    }

    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      context.res = {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: "missing_token"
      };
      return;
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      context.res = {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: "invalid_token"
      };
      return;
    }

    const username = decoded.username;
    const { flag } = req.body || {};

    if (!flag) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: "missing_flag"
      };
      return;
    }

    const containerClient = await getContainerClient();
    const usersObj = await readJsonBlob(containerClient, USERS_BLOB, { users: [] });
    const flagsObj = await readJsonBlob(containerClient, FLAGS_BLOB, { flags: [] });

    const user = usersObj.users.find(u => u.username === username);
    if (!user) {
      context.res = {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: "user_not_found"
      };
      return;
    }

    const flagEntry = flagsObj.flags.find(f => f.flag === flag);
    if (!flagEntry) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: "invalid_flag"
      };
      return;
    }

    // Check if user already claimed this flag
    if (!user.claimedFlags) user.claimedFlags = [];
    if (user.claimedFlags.includes(flag)) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: "already_claimed"
      };
      return;
    }

    // Award points and mark flag as claimed
    user.claimedFlags.push(flag);
    user.score = (user.score || 0) + flagEntry.points;

    await writeJsonBlob(containerClient, USERS_BLOB, usersObj);

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: "flag_accepted", 
        points: flagEntry.points,
        newScore: user.score 
      })
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