const { BlobServiceClient } = require("@azure/storage-blob");
const jwt = require("jsonwebtoken");

const AZURE_CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER = process.env.BLOB_CONTAINER || "ctfdata";
const USERS_BLOB = "users.json";
const FLAGS_BLOB = "flags.json";
const JWT_SECRET = process.env.JWT_SECRET;

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

function extractTokenFromHeader(header) {
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") return parts[1];
  return null;
}

module.exports = async function (context, req) {
  context.log("submitFlag endpoint hit");
  try {
    if (!JWT_SECRET) {
      context.res = { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' },
        body: "server_misconfigured"
      };
      return;
    }

    const authHeader = req.headers && (req.headers.authorization || req.headers.Authorization);
    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      context.res = { 
        status: 401, 
        headers: { 'Content-Type': 'application/json' },
        body: "missing_token"
      };
      return;
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      context.res = { 
        status: 401, 
        headers: { 'Content-Type': 'application/json' },
        body: "invalid_token"
      };
      return;
    }

    const username = payload.username;
    if (!username) {
      context.res = { 
        status: 401, 
        headers: { 'Content-Type': 'application/json' },
        body: "invalid_token"
      };
      return;
    }

    const { flag } = req.body || {};
    if (!flag) {
      context.res = { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' },
        body: "missing flag"
      };
      return;
    }

    const containerClient = await getContainerClient();

    // Load flags and users
    const flagsObj = await readJsonBlob(containerClient, FLAGS_BLOB, { flags: [] });
    const usersObj = await readJsonBlob(containerClient, USERS_BLOB, { users: [] });

    const user = usersObj.users.find((u) => u.username === username);
    if (!user) {
      context.res = { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' },
        body: "user_not_found"
      };
      return;
    }

    // find matching flag by exact string match
    const flagEntry = flagsObj.flags.find((f) => f.flag === flag);
    if (!flagEntry) {
      context.res = { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' },
        body: "incorrect_flag"
      };
      return;
    }

    // Check already claimed
    if (flagEntry.claimedBy) {
      context.res = { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' },
        body: "flag_already_claimed"
      };
      return;
    }

    // Prevent user claiming same flag twice (extra safety)
    user.claimedFlags = user.claimedFlags || [];
    if (user.claimedFlags.includes(flagEntry.id)) {
      context.res = { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' },
        body: "already_claimed_by_user"
      };
      return;
    }

    // Award points
    const points = Number(flagEntry.points) || 0;
    user.score = Number(user.score || 0) + points;
    user.claimedFlags.push(flagEntry.id);

    // Mark flag as claimed
    flagEntry.claimedBy = username;
    flagEntry.claimedAt = new Date().toISOString();

    // Write both blobs
    await writeJsonBlob(containerClient, USERS_BLOB, usersObj);
    await writeJsonBlob(containerClient, FLAGS_BLOB, flagsObj);

    context.res = { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: "ok", awarded: points })
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