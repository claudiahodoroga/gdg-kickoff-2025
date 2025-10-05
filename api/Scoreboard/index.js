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
  context.log("Scoreboard endpoint hit");
  try {
    const containerClient = await getContainerClient();
    const usersObj = await readJsonBlob(containerClient, USERS_BLOB, { users: [] });

    // Sort by score descending
    const sorted = usersObj.users
      .map(u => ({ username: u.username, score: u.score }))
      .sort((a, b) => b.score - a.score);

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sorted)
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