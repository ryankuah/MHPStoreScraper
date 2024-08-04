const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

function MobileHomePark(name, address, price) {
  this.name = name;
  this.address = address;
  this.price = price;
}

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

async function scrape(URL) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(URL); // Replace with the actual URL

  await page.waitForSelector(".item-title");

  const links = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll(".item-title"));
    return elements.map((element) => element.href);
  });

  await browser.close();
  return links;
}
async function scrapeListing(URL) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(URL, { timeout: 120000 });

  await page.waitForSelector(".page-header");

  const nameLocation = await page.evaluate(() => {
    const headerElement = document.querySelector(".page-header");
    if (!headerElement) return null;

    const nameElement = headerElement.querySelector('[itemprop="name"]');
    return nameElement ? nameElement.innerText : null;
  });

  const price = await page.evaluate(() => {
    const priceElement = document.querySelector(
      "#main > div.container > div.page-header.bordered.mb0 > div.row > div.col-fixed.text-right > h1",
    );
    return priceElement ? priceElement.innerText : null;
  });

  await browser.close();

  if (nameLocation && price) {
    const park = new MobileHomePark(
      nameLocation.split("\n")[0],
      nameLocation.split("\n")[1].trim(),
      "$" + price.split("$")[1],
    );
    console.log(park);
    return park;
  } else {
    console.log("Required elements not found on the page.");
    return null;
  }
}

async function findNextEmptyRow(auth) {
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: "1-t9WFMpzCG5TOfQyC2g9RODv_myizlRwDlnUWTX78ow",
    range: "A:A", // Adjust this range if you want to check another column
  });
  const rows = res.data.values;
  return rows ? rows.length + 1 : 1;
}

async function updateSpreadsheet(auth, park) {
  console.log("this" + park);
  const index = await findNextEmptyRow(auth);
  const range = `A${index}:C${index + park.length - 1}`;
  const _values = [];
  await park.forEach((park) => {
    _values.push([park.name, park.address, park.price]);
  });
  console.log("array" + _values);
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId: "1-t9WFMpzCG5TOfQyC2g9RODv_myizlRwDlnUWTX78ow",
    range: range,
    valueInputOption: "USER_ENTERED",
    resource: {
      values: _values,
    },
  });
}

/*
(async () => {
  var temp = await scrapeListing(
    "https://www.mobilehomeparkstore.com/mobile-home-parks/2917796-1740-martin-luther-king-junior-boulevard-sebring-fl-33870-us-for-sale-in-sebring-fl",
  );

  authorize()
    .then((auth) => updateSpreadsheet(auth, temp))
    .catch(console.error);
})();
*/

(async () => {
  for (let i = 1; i < 9; i++) {
    const pageLinks = await scrape(
      `https://www.mobilehomeparkstore.com/mobile-home-parks-for-sale/usa/page/${i}`,
    );
    const parkResPromises = pageLinks.map((link) => scrapeListing(link));
    var parkRes = await Promise.all(parkResPromises);
    parkRes = parkRes.filter((res) => res !== null);

    try {
      const auth = await authorize();
      await updateSpreadsheet(auth, parkRes);
    } catch (error) {
      console.error(error);
    }
  }
})();
