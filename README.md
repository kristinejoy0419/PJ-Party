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
2. In the script editor, open **Project Settings > Script properties** and add `ANTHROPIC_API_KEY` with an API key from https://platform.claude.com. This powers the recipe helper.
3. Pick `setup` in the function menu and click **Run**. Approve the permissions (Sheets, Drive, Gmail, triggers). This creates the **Recipes** tab, a **PJ Party Recipes** Drive folder, and the 5-minute helper schedule.
4. **Deploy > New deployment**, type **Web app**, execute as **Me**, access **Anyone**.
5. Copy the web app URL into `config.js` as `sheetUrl` and commit.
4. Turn on GitHub Pages: **Settings > Pages**, deploy from the `main` branch, root folder. The site appears at `https://kristinejoy0419.github.io/PJ-Party/`.

## The recipe helper

Each upload (photo, screenshot, PDF or text file) is saved to the Drive folder and logged on the **Recipes** tab with Status **New**. Every 5 minutes the helper sends new uploads to Claude, which reads the recipe and fills in whose recipe it is, servings, ingredients, steps and the story. It sets Status to **Organized** and emails Kristine a clean copy. Anything it can't read is marked **Needs a look**, with a note saying why. The **PJ Party > Organize new recipes now** menu in the Sheet runs it right away.

Organized recipes show up on the site under "Read the recipe". To fix or remove an entry, edit its row in the Sheet.
