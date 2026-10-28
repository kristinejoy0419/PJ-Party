/**
 * Recipe collector for the 5th Annual Pajama Party.
 *
 * Setup (details in README.md):
 *  1. Paste this into Extensions > Apps Script on a Google Sheet.
 *  2. Project Settings > Script properties: add GEMINI_API_KEY (any Gemini key
 *     from Google AI Studio). Optionally add GEMINI_MODEL to pick a different model.
 *  3. Run setup() once and approve the permissions.
 *  4. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone)
 *     and copy the web app URL into config.js as sheetUrl.
 *
 * What happens to each submission:
 *  - doPost saves the uploaded file to a "PJ Party Recipes" Drive folder and adds
 *    a row to the "Recipes" tab with Status "New".
 *  - The recipe helper (organizeRecipes, every 5 minutes) sends each new upload
 *    to Gemini, which reads the photo or PDF and fills in whose recipe it is,
 *    servings, ingredients, steps and the story, then emails Kristine a tidy copy.
 *  - The pajama helper (findPajamas, on the same 5-minute run) takes each guest
 *    who is still looking for a size, has Gemini search Old Navy for the Tree
 *    Stripes pajamas in those sizes, and emails the guest what it found
 *    (Kristine gets a blind copy).
 */
const COLLECTOR_EMAIL = "kristinejoy@gmail.com";
const DEFAULT_MODEL = "gemini-2.5-flash";
const FOLDER_NAME = "PJ Party Recipes";
const COURSES = ["Bites", "Mains", "Sides", "Sweets", "Sips"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const COLS = ["Timestamp", "Name", "Party", "Dish", "Course", "Note", "File", "Status",
  "Whose recipe", "Serves", "Ingredients", "How to make it", "Story", "Helper notes",
  "Email", "Pajamas", "Sizes needed", "Pajama help"];
const C = Object.fromEntries(COLS.map((h, i) => [h, i + 1])); // header -> 1-based column

function recipesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Recipes");
  if (!sheet) {
    sheet = ss.insertSheet("Recipes");
    sheet.appendRow(COLS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLS.length).setFontWeight("bold");
  } else if (sheet.getLastColumn() < COLS.length) {
    // An older copy of the tab: add the newer columns on the right.
    sheet.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight("bold");
  }
  return sheet;
}

function folder_() {
  const found = DriveApp.getFoldersByName(FOLDER_NAME);
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME);
}

/** Run once from the editor: creates the tab and folder and starts the recipe helper. */
function setup() {
  recipesSheet_();
  folder_();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "organizeRecipes")
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("organizeRecipes").timeBased().everyMinutes(5).create();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("PJ Party")
    .addItem("Organize new recipes now", "organizeRecipes")
    .addItem("Find pajamas for guests now", "findPajamasNow")
    .addToUi();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

const clip_ = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

// ---------- Web app ----------

function doGet() {
  const rows = recipesSheet_().getDataRange().getValues().slice(1);
  const entries = rows.map(r => ({
    name: r[C.Name - 1], party: r[C.Party - 1], dish: r[C.Dish - 1], course: r[C.Course - 1],
    from: r[C["Whose recipe"] - 1], hasFile: Boolean(r[C.File - 1]),
    // The typed-up recipes stay on the Sheet for Kristine's cookbook, not on the site.
  }));
  return json_({ ok: true, entries });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "Bad request" }); }
  if (body.website) return json_({ ok: true }); // honeypot: quietly ignore bots

  const entry = {
    name: clip_(body.name, 60), party: Math.min(12, Math.max(1, Number(body.party) || 1)),
    dish: clip_(body.dish, 80), note: clip_(body.note, 300),
    course: COURSES.indexOf(body.course) >= 0 ? body.course : "Mains",
    pajamas: body.pajamas === "Still looking" ? "Still looking" : body.pajamas === "Got them" ? "Got them" : "",
    email: clip_(body.email, 120), sizes: clip_(body.sizes, 300),
  };
  if (entry.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email)) entry.email = "";
  if (!entry.name || !entry.dish) return json_({ ok: false, error: "Name and dish are required" });

  let fileUrl = "";
  if (body.file && body.file.data) {
    const bytes = Utilities.base64Decode(body.file.data);
    if (bytes.length > MAX_FILE_BYTES) return json_({ ok: false, error: "File is over 10 MB" });
    const blob = Utilities.newBlob(bytes, clip_(body.file.type, 100) || "application/octet-stream",
      entry.name + " - " + entry.dish + " - " + clip_(body.file.name, 80));
    fileUrl = folder_().createFile(blob).getUrl();
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const row = COLS.map(() => "");
    row[C.Timestamp - 1] = new Date();
    row[C.Name - 1] = entry.name;
    row[C.Party - 1] = entry.party;
    row[C.Dish - 1] = entry.dish;
    row[C.Course - 1] = entry.course;
    row[C.Note - 1] = entry.note;
    row[C.File - 1] = fileUrl;
    row[C.Status - 1] = fileUrl ? "New" : "No recipe yet";
    row[C.Email - 1] = entry.email;
    row[C.Pajamas - 1] = entry.pajamas;
    row[C["Sizes needed"] - 1] = entry.pajamas === "Still looking" ? entry.sizes : "";
    row[C["Pajama help"] - 1] = entry.pajamas !== "Still looking" ? ""
      : entry.email && entry.sizes ? "Searching" : "No email, ask Kristine";
    recipesSheet_().appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

// ---------- Recipe helper ----------

const RECIPE_SCHEMA = {
  type: "OBJECT",
  required: ["is_recipe", "whose_recipe", "serves", "ingredients", "steps", "story", "helper_notes"],
  propertyOrdering: ["is_recipe", "whose_recipe", "serves", "ingredients", "steps", "story", "helper_notes"],
  properties: {
    is_recipe: { type: "BOOLEAN", description: "False if the file is not a recipe or cannot be read." },
    whose_recipe: { type: "STRING", description: "Possessive form of whose recipe it is, e.g. \"Lola Nena's\" or \"the Garcia family's\". Empty if unknown." },
    serves: { type: "STRING", description: "Servings or yield as written, e.g. \"8 to 10\". Empty if not stated." },
    ingredients: { type: "ARRAY", items: { type: "STRING" }, description: "One ingredient per item with its amount, in the order written." },
    steps: { type: "ARRAY", items: { type: "STRING" }, description: "One step per item, in order, without numbering." },
    story: { type: "STRING", description: "Any personal note or history written on the card or in the guest's note. Empty if none." },
    helper_notes: { type: "STRING", description: "Short note for Kristine about anything unreadable, missing or guessed. Empty if all clear." },
  },
};

function organizeRecipes() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty("GEMINI_API_KEY");
  if (!key) return;
  const model = props.getProperty("GEMINI_MODEL") || DEFAULT_MODEL;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // a previous run is still going
  try {
    const sheet = recipesSheet_();
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (r[C.Status - 1] !== "New") continue;
      const rowNum = i + 1;
      try {
        const result = readRecipe_(key, model, r);
        writeResult_(sheet, rowNum, result);
        emailKristine_(r, result);
      } catch (err) {
        sheet.getRange(rowNum, C.Status).setValue("Needs a look");
        sheet.getRange(rowNum, C["Helper notes"]).setValue(String(err.message || err).slice(0, 500));
      }
    }
    findPajamas_(sheet, key, model);
  } finally {
    lock.releaseLock();
  }
}

function readRecipe_(key, model, r) {
  const fileId = String(r[C.File - 1]).match(/[-\w]{25,}/);
  if (!fileId) throw new Error("Could not find the uploaded file");
  const blob = DriveApp.getFileById(fileId[0]).getBlob();
  const type = blob.getContentType();
  const data = Utilities.base64Encode(blob.getBytes());

  let filePart;
  if (type === "application/pdf" || /^image\/(jpeg|png|webp|heic|heif)$/.test(type)) {
    filePart = { inline_data: { mime_type: type, data } };
  } else if (/^text\//.test(type)) {
    filePart = { text: blob.getDataAsString().slice(0, 50000) };
  } else {
    throw new Error("This file type (" + type + ") can't be read automatically. Open the file and type it in.");
  }

  const prompt = [
    "A guest uploaded this family recipe for a holiday pajama party potluck. The host is collecting every",
    "recipe so guests can recreate them at home. Transcribe it faithfully: keep the family's wording,",
    "amounts and quirks (\"a pinch\", \"until it smells right\"), fix only obvious spelling slips, and split",
    "it into ingredients and steps. Do not invent amounts or steps that aren't there; mention gaps in",
    "helper_notes instead.",
    "",
    "Guest: " + r[C.Name - 1],
    "Dish they named: " + r[C.Dish - 1],
    "Their note: " + (r[C.Note - 1] || "(none)"),
  ].join("\n");

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: { "x-goog-api-key": key },
    payload: JSON.stringify({
      contents: [{ role: "user", parts: [filePart, { text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: RECIPE_SCHEMA },
    }),
  });

  const code = res.getResponseCode();
  const msg = JSON.parse(res.getContentText());
  if (code !== 200) throw new Error("Gemini API error " + code + ": " + ((msg.error && msg.error.message) || "unknown"));
  const cand = (msg.candidates || [])[0];
  if (!cand) throw new Error("Gemini returned no answer" + (msg.promptFeedback && msg.promptFeedback.blockReason ? " (" + msg.promptFeedback.blockReason + ")" : "") + ". Open the file and type it in.");
  if (cand.finishReason === "MAX_TOKENS") throw new Error("The recipe was too long to finish. Open it and check.");
  if (cand.finishReason && cand.finishReason !== "STOP") throw new Error("Gemini stopped early (" + cand.finishReason + "). Open the file and type it in.");
  const text = ((cand.content && cand.content.parts) || []).map(p => p.text || "").join("");
  return JSON.parse(text);
}

function writeResult_(sheet, rowNum, x) {
  const set = (col, v) => sheet.getRange(rowNum, C[col]).setValue(v);
  if (!x.is_recipe) {
    set("Status", "Needs a look");
    set("Helper notes", x.helper_notes || "This doesn't look like a recipe.");
    return;
  }
  set("Whose recipe", x.whose_recipe);
  set("Serves", x.serves);
  set("Ingredients", x.ingredients.join("\n"));
  set("How to make it", x.steps.map((s, i) => (i + 1) + ". " + s).join("\n"));
  set("Story", x.story);
  set("Helper notes", x.helper_notes);
  set("Status", x.helper_notes ? "Organized, check notes" : "Organized");
}

function emailKristine_(r, x) {
  if (!x.is_recipe) return;
  const lines = [
    r[C.Name - 1] + " is bringing " + r[C.Dish - 1] + " (" + r[C.Course - 1] + ", party of " + r[C.Party - 1] + ").",
    x.whose_recipe ? "Recipe: " + x.whose_recipe : "",
    x.serves ? "Serves: " + x.serves : "",
    x.story ? "\nThe story:\n" + x.story : "",
    "\nIngredients:\n" + x.ingredients.map(s => "- " + s).join("\n"),
    "\nHow to make it:\n" + x.steps.map((s, i) => (i + 1) + ". " + s).join("\n"),
    x.helper_notes ? "\nNote from the recipe helper: " + x.helper_notes : "",
    "\nOriginal upload: " + r[C.File - 1],
  ];
  try {
    MailApp.sendEmail({
      to: COLLECTOR_EMAIL,
      subject: "PJ Party recipe: " + r[C.Dish - 1] + " from " + r[C.Name - 1],
      body: lines.filter(Boolean).join("\n"),
    });
  } catch (err) {
    // The row is organized even if the daily email quota is used up.
  }
}

// ---------- Pajama helper ----------

const PAJAMA_LOOKS = [
  "Kids: Tree Stripes flannel pajama set (the original, mostly sold out) https://oldnavy.gap.com/browse/product.do?pid=904628002",
  "Kids: Always Believin' snug-fit set, Santa top with tree-stripe pants https://oldnavy.gap.com/browse/product.do?pid=904646042",
  "Women's: Always Believin' tee https://oldnavy.gap.com/browse/product.do?pid=910769032",
  "Women's: Tree Stripes flannel pajama pants https://oldnavy.gap.com/browse/product.do?pid=908779022",
  "Women's: Tree Stripes boxer shorts https://oldnavy.gap.com/browse/product.do?pid=908778052",
  "Men's: Tree Stripes pajama set, button-up top and pants https://oldnavy.gap.com/browse/product.do?pid=905023042",
  "Men's: Santa crew-neck tee https://oldnavy.gap.com/browse/product.do?pid=905005002",
];
const SITE_URL = "https://kristinejoy0419.github.io/PJ-Party/#wear";

/** Menu item / manual run: look for pajamas for anyone still waiting. */
function findPajamasNow() {
  const key = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!key) throw new Error("Add GEMINI_API_KEY in Project Settings > Script properties first.");
  findPajamas_(recipesSheet_(), key, PropertiesService.getScriptProperties().getProperty("GEMINI_MODEL") || DEFAULT_MODEL);
}

function findPajamas_(sheet, key, model) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r[C["Pajama help"] - 1] !== "Searching") continue;
    const rowNum = i + 1;
    try {
      const found = searchPajamas_(key, model, r);
      emailGuestPajamas_(r, found);
      sheet.getRange(rowNum, C["Pajama help"]).setValue("Emailed " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMM d"));
    } catch (err) {
      sheet.getRange(rowNum, C["Pajama help"]).setValue("Needs a look: " + String(err.message || err).slice(0, 300));
    }
  }
}

function searchPajamas_(key, model, r) {
  const prompt = [
    "You are helping a guest find pajamas for a family holiday pajama party. The dress code is Old Navy's",
    "\"Tree Stripes\" holiday pajamas (red and green striped, Christmas tree print). These are the looks the host suggested:",
    PAJAMA_LOOKS.map(s => "- " + s).join("\n"),
    "",
    "The guest needs: " + r[C["Sizes needed"] - 1],
    "",
    "Search the web now (oldnavy.gap.com first, then other stores that carry it, like resale sites) for each person and",
    "size listed. For each person, give the best matching item, whether that size looks in stock, the price if shown,",
    "and a link. Only use links that appeared in your search results; never make up a product link. If a size seems",
    "sold out, say so and suggest the closest Tree Stripes alternative (another piece in the same print, or a nearby size).",
    "",
    "Write the answer as a short, warm plain-text email body from the party host's pajama helper, addressed to " + r[C.Name - 1] + ".",
    "One short section per person. No markdown symbols like ** or #. Do not add a sign-off; one is added for you.",
  ].join("\n");

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: { "x-goog-api-key": key },
    payload: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
  });
  const code = res.getResponseCode();
  const msg = JSON.parse(res.getContentText());
  if (code !== 200) throw new Error("Gemini API error " + code + ": " + ((msg.error && msg.error.message) || "unknown"));
  const cand = (msg.candidates || [])[0];
  const text = cand && ((cand.content && cand.content.parts) || []).map(p => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini found nothing to send");
  return text;
}

function emailGuestPajamas_(r, found) {
  const body = [
    found,
    "",
    "Every look the host picked, with sizes, is here: " + SITE_URL,
    "Stock moves fast this time of year, so grab your size soon. If nothing fits, just reply and Kristine will help.",
    "",
    "See you in your pajamas on December 20th!",
    "The 5th Annual Pajama Party",
  ].join("\n");
  MailApp.sendEmail({
    to: r[C.Email - 1],
    bcc: COLLECTOR_EMAIL,
    replyTo: COLLECTOR_EMAIL,
    name: "Kristine's Pajama Party",
    subject: "🎄 Your Tree Stripes pajamas: what's in stock",
    body,
  });
}
