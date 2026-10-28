# 5th Annual Pajama Party

The party site: date and place (with Google, Apple and Outlook calendar links), the
Tree Stripes dress code with Old Navy links, a recipe upload form, and "The Family
Table" list of who's bringing what.

## Files

- `index.html` is the whole page.
- `config.js` holds the party details (date, time, address, who collects recipes) and the Google Sheet URL.
- `assets/` has the pajama photos.
- `pj-party.ics` is the Apple Calendar invite. Update it if the date or time changes.
- `apps-script/Code.gs` is the Google Apps Script behind the form. It saves each upload to Drive, logs it on the Sheet, and runs the recipe helper.

## Going live

Until `sheetUrl` is set, the page runs as a preview: recipes a visitor adds stay in their own browser only.

1. Create a Google Sheet, open **Extensions > Apps Script**, and paste in `apps-script/Code.gs`.
2. In the script editor, open **Project Settings > Script properties** and add `GEMINI_API_KEY` with a Gemini API key (an existing key from Google AI Studio works). This powers the recipe helper. It uses `gemini-2.5-flash` by default; add a `GEMINI_MODEL` property to use a different model.
3. Pick `setup` in the function menu and click **Run**. Approve the permissions (Sheets, Drive, Gmail, triggers). This creates the **Recipes** tab, a **PJ Party Recipes** Drive folder, and the 5-minute helper schedule.
4. **Deploy > New deployment**, type **Web app**, execute as **Me**, access **Anyone**.
5. Copy the web app URL into `config.js` as `sheetUrl` and commit.
4. Turn on GitHub Pages: **Settings > Pages**, deploy from the `main` branch, root folder. The site appears at `https://kristinejoy0419.github.io/PJ-Party/`.

## The recipe helper

Each upload (photo, screenshot, PDF or text file) is saved to the Drive folder and logged on the **Recipes** tab with Status **New**. Every 5 minutes the helper sends new uploads to Gemini, which reads the recipe and fills in whose recipe it is, servings, ingredients, steps and the story. It sets Status to **Organized** and emails Kristine a clean copy. The typed-up recipes stay on the Sheet for the party cookbook; the site only lists who is bringing what. Anything it can't read is marked **Needs a look**, with a note saying why. The **PJ Party > Organize new recipes now** menu in the Sheet runs it right away.

To fix or remove an entry, edit its row in the Sheet.

## The pajama helper

The form asks each guest whether they've bought their Tree Stripes pajamas. Guests who are still looking list who needs pajamas and in what sizes, plus their email. Those rows get **Pajama help: Searching** on the Recipes tab. On the same 5-minute run, Gemini searches the web (Google Search grounding) for those sizes, starting with Old Navy. The guest then gets an email with what's in stock and the links, and Kristine gets a blind copy. Replies go to Kristine. The row then reads **Emailed** with the date, or **Needs a look** with the reason. The **PJ Party > Find pajamas for guests now** menu runs it right away.

After pasting a new version of `Code.gs`, open **Deploy > Manage deployments**, edit the web app, set **Version: New version** and click **Deploy**. The URL stays the same.
