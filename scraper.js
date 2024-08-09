const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

function MobileHomePark() {
  this.name = null;
  this.link = null;
  this.address = null;
  this.price = null;
  this.broker = null;
  this.brokerFirm = null;
  this.desc = null;
  this.locDesc = null;
  this.occupancy = null;
  this.lots = null;
  this.yearBuilt = null;
  this.size = null;
  this.lotRent = null;
  this.communityType = null;
  this.water = null;
  this.waterPaid = null;
  this.sewer = null;
  this.grossIncome = null;
  this.operatingExpense = null;
  this.operatingIncome = null;
  this.infoType = null;
  this.capRate = null;
  this.debtInformation = null;
  this.sgLots = null;
  this.dbLots = null;
  this.tpLots = null;
  this.pmLots = null;
  this.parkOwned = null;
  this.avgRent = null;
  this.rvLots = null;
  this.rvLotRent = null;
  this.purchaseMethod = null;
  this.listingID = null;
  this.postedDate = null;
  this.updatedDate = null;
}

function ParkData(desc, data) {
  this.desc = desc;
  this.data = data;
}
const args = process.argv.slice(2);

switch (args.length) {
  case 1:
    scrapeOne(args[0]);
    break;
  case 2:
    scrapeRange(args[0], args[1]);
    break;
}

async function scrapeDaily() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(
    "https://www.mobilehomeparkstore.com/mobile-home-parks-for-sale/usa",
  );

  await page.waitForSelector(
    "#search-results > div.search-results-list > div:nth-child(3) > nav > ul > li:nth-child(6) > a",
  );

  var pages = await page.evaluate(() => {
    return document.querySelector(
      "#search-results > div.search-results-list > div:nth-child(3) > nav > ul > li:nth-child(6) > a",
    ).innerText;
  });

  await browser.close();
  for (let i = 1; i <= pages; i++) {
    console.log("Scraping page " + i);
    const pageLinks = await scrape(
      `https://www.mobilehomeparkstore.com/mobile-home-parks-for-sale/usa/page/${i}?order=create_desc`,
    );
    console.log(pageLinks);
    //TODO:: check to see if link has already been scraped
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
}

async function scrapeOne(URL) {
  var temp = await scrapeListing(URL);

  var tempArr = [];
  tempArr.push(temp);
  authorize()
    .then((auth) => updateSpreadsheet(auth, tempArr))
    .catch(console.error);
}

//#search-results > div.search-results-list > div:nth-child(3) > nav > ul > li:nth-child(6) > a
//https://www.mobilehomeparkstore.com/mobile-home-parks/sold/all/page/2

async function scrapeRange(start, end) {
  for (let i = start; i <= end; i++) {
    console.log("Scraping page " + i);
    const pageLinks = await scrape(
      `https://www.mobilehomeparkstore.com/mobile-home-parks/sold/all/page/${i}`,
    );
    console.log(pageLinks);
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
}

/*
(async () => {
  var temp = await scrapeListing(
    "https://www.mobilehomeparkstore.com/mobile-home-parks/6677277-3-500-pad-manufactured-home-community-selling-5-equity-for-sale-in-southport-fl",
  );

  var tempArr = [];
  tempArr.push(temp);
  authorize()
    .then((auth) => updateSpreadsheet(auth, tempArr))
    .catch(console.error);
})();
*/

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
  let park = new MobileHomePark();
  park.link = URL;
  await page.goto(URL, { timeout: 120000 });

  await page.waitForSelector(".page-header");

  var nameLocation = await page.evaluate(() => {
    const headerElement = document.querySelector(".page-header");
    if (!headerElement) return null;

    const nameElement = headerElement.querySelector('[itemprop="name"]');
    return nameElement ? nameElement.innerText : null;
  });
  if (!nameLocation || !nameLocation.split("\n"[1]))
    nameLocation = "No Info \n No Info";
  park.name = nameLocation.split("\n")[0];
  park.address = nameLocation.split("\n")[1].trim();

  park.price = await page.evaluate(() => {
    const priceElement = document.querySelector(
      "#main > div.container > div.page-header.bordered.mb0 > div.row > div.col-fixed.text-right > h1",
    );
    return priceElement ? priceElement.innerText : null;
  });

  park.broker = await page.evaluate(() => {
    const brokerElement = document.querySelector(
      "#sidebar > div > div.card.shadow > h2",
    );
    return brokerElement ? brokerElement.innerText : null;
  });

  park.brokerFirm = await page.evaluate(() => {
    const brokerFirmElement = document.querySelector(
      "#sidebar > div > div.card.shadow > h2 > div > div",
    );
    return brokerFirmElement ? brokerFirmElement.innerText : null;
  });

  const featureList = await page.evaluate(() => {
    const featureListElement = document.querySelector(
      "#content > div.row.justify-content-md-center > div.col-fluid > div > div:nth-child(3) > ul",
    );
    if (!featureListElement) return null;
    var out = [];
    featureListElement.querySelectorAll("li").forEach((li) => {
      out.push(li.innerText);
    });
    return out;
  });
  if (featureList) {
    var featureData = [];
    featureList.forEach((feature) => {
      featureData.push(
        new ParkData(
          feature.split(":")[0].trim(),
          feature.split(":")[1].trim(),
        ),
      );
    });
    setParkData(park, featureData);
  }

  const dataRows = await page.evaluate(() => {
    var results = [];
    try {
      var trHtml = document
        .querySelector(
          "#content > div.row.justify-content-md-center > div.col-fluid > div > div:nth-child(3)",
        )
        .querySelectorAll("tr");
      trHtml.forEach((tr) => {
        var data = tr.querySelectorAll("td");
        results.push(data[0].innerText, data[1].innerText);
      });
      return results;
    } catch (err) {
      console.log(err);
      return null;
    }
  });
  if (!dataRows) {
    return park;
  }

  await browser.close();
  let parkData = [];
  for (let i = 0; i < dataRows.length; i += 2) {
    parkData.push(new ParkData(dataRows[i], dataRows[i + 1]));
  }

  setParkData(park, parkData);

  return park;
}

async function findNextEmptyRow(auth) {
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: "1-t9WFMpzCG5TOfQyC2g9RODv_myizlRwDlnUWTX78ow",
    range: "Test!A:A", // Adjust this range if you want to check another column
  });
  const rows = res.data.values;
  return rows ? rows.length + 1 : 1;
}

async function updateSpreadsheet(auth, park) {
  const index = await findNextEmptyRow(auth);
  const range = `Test!A${index}:AM${index + park.length - 1}`;
  console.log(range);
  const _values = [];
  await park.forEach((park) => {
    let state = null;
    let county = null;
    let street = null;
    let zip = null;
    if (park.address) {
      const address = park.address.split(",");
      switch (address.length) {
        case 1:
          let stateTemp = address[0].split(" ").trim();
          if (stateTemp.length == 3) {
            state = stateTemp[2];
          }
          break;
        case 2:
          county = address[0].trim();
          state = address[1].trim();
          break;
        case 3:
          street = address[0].trim();
          county = address[1].trim();
          state = address[2].trim();
          break;
        default:
          street = null;
          zip = null;
          city = null;
          county = null;
          state = null;
          break;
      }
      let zipTemp = state.split(" ");
      if (zipTemp.length > 1) {
        zip = zipTemp[1].trim();
        state = zipTemp[0].trim();
      }
    }
    if (park.price) {
      let parkArr = park.price.split(" ");
      var saleStatus = null;
      var priceReduced = false;
      parkArr.forEach((parkArrItem) => {
        parkArrItem = parkArrItem.trim();
        switch (parkArrItem) {
          case "For Sale":
            saleStatus = "For Sale";
            break;
          case "Sale Pending":
            saleStatus = "Sale Pending";
            break;
          case "Sold":
            saleStatus = "Sold";
            break;
          case "Price Reduced":
            priceReduced = true;
          default:
            park.price = parkArrItem;
            break;
        }
      });
    }
    _values.push([
      park.listingID,
      `=HYPERLINK("${park.link}", "${park.name}")`,
      state,
      county,
      street,
      zip,
      park.price,
      saleStatus,
      priceReduced,
      park.broker,
      park.brokerFirm,
      park.desc,
      park.locDesc,
      park.occupancy,
      park.lots,
      park.yearBuilt,
      park.size,
      park.lotRent,
      park.communityType,
      park.water,
      park.waterPaid,
      park.sewer,
      park.grossIncome,
      park.operatingExpense,
      park.operatingIncome,
      park.infoType,
      park.capRate,
      park.debtInformation,
      park.sgLots,
      park.dbLots,
      park.tpLots,
      park.pmLots,
      park.parkOwned,
      park.avgRent,
      park.rvLots,
      park.rvLotRent,
      park.purchaseMethod,
      park.postedDate,
      park.updatedDate,
    ]);
  });
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

function setParkData(park, parkData) {
  parkData.forEach((parkData) => {
    switch (parkData.desc) {
      case "Total Occupancy:":
        park.occupancy = parkData.data;
        break;
      case "Number of MH Lots:":
        park.lots = parkData.data;
        break;
      case "Year Built:":
        park.yearBuilt = parkData.data;
        break;
      case "Size:":
        park.size = parkData.data;
        break;
      case "Average MH Lot Rent:":
        park.lotRent = parkData.data;
        break;
      case "Community Type:":
        park.communityType = parkData.data;
        break;
      case "Water:":
        park.water = parkData.data;
        break;
      case "Water Paid By:":
        park.waterPaid = parkData.data;
        break;
      case "Sewer:":
        park.sewer = parkData.data;
        break;
      case "Gross Income:":
        park.grossIncome = parkData.data;
        break;
      case "Operating Expense:":
        park.operatingExpense = parkData.data;
        break;
      case "Net Operating Income:":
        park.operatingIncome = parkData.data;
        break;
      case "Information Type:":
        park.infoType = parkData.data;
        break;
      case "Cap Rate":
        park.capRate = parkData.data;
        break;
      case "Debt Info:":
        park.debtInformation = parkData.data;
        break;
      case "Singlewide Lots:":
        park.sgLots = parkData.data;
        break;
      case "Doublewide Lots:":
        park.dbLots = parkData.data;
        break;
      case "Triplewide Lots:":
        park.tpLots = parkData.data;
        break;
      case "Park Model Lots:":
        park.pmLots = parkData.data;
        break;
      case "Number of Park-owned Homes:":
        park.parkOwned = parkData.data;
        break;
      case "Average Rent for Park-owned Homes:":
        park.avgRent = parkData.data;
        break;
      case "Number of RV Lots:":
        park.rvLots = parkData.data;
        break;
      case "Average RV Lot Rent:":
        park.rvLotRent = parkData.data;
        break;
      case "Purchase Method":
        park.purchaseMethod = parkData.data;
        break;
      case "Listing ID":
        park.listingID = parkData.data;
        break;
      case "Posted On":
        park.postedDate = parkData.data;
        break;
      case "Updated On":
        park.updatedDate = parkData.data;
        break;
      default:
        console.log(parkData.desc + " - " + park.name);
        break;
    }
  });
}
