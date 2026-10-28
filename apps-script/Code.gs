/**
 * Recipe collector for the 5th Annual Pajama Party.
 *
 * Paste this into Extensions > Apps Script on a Google Sheet, then
 * Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 * Copy the web app URL into config.js as sheetUrl.
 *
 * The Sheet gets a "Recipes" tab (one row per guest) and every new recipe is
 * also emailed to COLLECTOR_EMAIL.
 */
const COLLECTOR_EMAIL = "kristinejoy@gmail.com";
const COURSES = ["Bites", "Mains", "Sides", "Sweets", "Sips"];
const HEADERS = ["Timestamp", "Name", "Party", "Dish", "Whose recipe", "Course", "Ingredients", "How to make it", "Story"];

function recipesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Recipes");
  if (!sheet) {
    sheet = ss.insertSheet("Recipes");
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

const clip_ = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function doGet() {
  const rows = recipesSheet_().getDataRange().getValues().slice(1);
  const entries = rows.map(r => ({
    name: r[1], party: r[2], dish: r[3], from: r[4], course: r[5],
    ingredients: r[6], steps: r[7], story: r[8],
  }));
  return json_({ ok: true, entries });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "Bad request" }); }
  if (body.website) return json_({ ok: true }); // honeypot: quietly ignore bots

  const entry = {
    name: clip_(body.name, 60), party: Math.min(12, Math.max(1, Number(body.party) || 1)),
    dish: clip_(body.dish, 80), from: clip_(body.from, 80),
    course: COURSES.indexOf(body.course) >= 0 ? body.course : "Mains",
    ingredients: clip_(body.ingredients, 3000), steps: clip_(body.steps, 5000), story: clip_(body.story, 1500),
  };
  if (!entry.name || !entry.dish) return json_({ ok: false, error: "Name and dish are required" });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    recipesSheet_().appendRow([new Date(), entry.name, entry.party, entry.dish, entry.from, entry.course,
      entry.ingredients, entry.steps, entry.story]);
  } finally {
    lock.releaseLock();
  }

  try {
    MailApp.sendEmail({
      to: COLLECTOR_EMAIL,
      subject: "PJ Party recipe: " + entry.dish + " from " + entry.name,
      body: [
        entry.name + " is bringing " + entry.dish + " (" + entry.course + ", party of " + entry.party + ").",
        entry.from ? "Whose recipe: " + entry.from : "",
        entry.story ? "\nThe story:\n" + entry.story : "",
        entry.ingredients ? "\nIngredients:\n" + entry.ingredients : "",
        entry.steps ? "\nHow to make it:\n" + entry.steps : "",
        (!entry.ingredients && !entry.steps) ? "\nNo recipe yet. They said they'll send it later." : "",
      ].filter(Boolean).join("\n"),
    });
  } catch (err) {
    // The row is saved even if the email quota is used up.
  }
  return json_({ ok: true });
}
