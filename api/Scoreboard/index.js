const { BlobServiceClient } = require("@azure/storage-blob");

const AZURE_CONN = process.env.AZURE_CONN;
const CONTAINER = process.env.BLOB_CONTAINER || "ctfdata";
const USERS_BLOB = "users.json";

async function getContainerClient() {
  if (!AZURE_CONN) throw new Error("Missing AZURE_CONN");
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

async function streamToBuffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (data) => chunks.push(data instanceof Buffer ? data : Buffer.from(data)));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

module.exports = async function (context, req) {
  context.log("scoreboard endpoint hit");
  try {
    const containerClient = await getContainerClient();
    const usersObj = await readJsonBlob(containerClient, USERS_BLOB, { users: [] });

    const results = (usersObj.users || [])
      .map((u) => ({ username: u.username, score: Number(u.score || 0) }))
      .sort((a, b) => b.score - a.score);

    context.res = { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results)
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