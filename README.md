# 5th Annual Pajama Party

The party site: date and place, the Tree Stripes dress code with Old Navy links,
a recipe card form, and "The Family Table" list of who's bringing what.

## Files

- `index.html` is the whole page.
- `config.js` holds the party details (date, time, address, who collects recipes) and the Google Sheet URL.
- `assets/` has the pajama photos.
- `apps-script/Code.gs` is the small Google Apps Script that saves recipes to a Sheet and emails each one to Kristine.

## Going live

Until `sheetUrl` is set, the page runs as a preview: recipes a visitor adds stay in their own browser only.

1. Create a Google Sheet, open **Extensions > Apps Script**, and paste in `apps-script/Code.gs`.
2. **Deploy > New deployment**, type **Web app**, execute as **Me**, access **Anyone**. Approve the permissions (Sheets and Gmail).
3. Copy the web app URL into `config.js` as `sheetUrl` and commit.
4. Turn on GitHub Pages: **Settings > Pages**, deploy from the `main` branch, root folder. The site appears at `https://kristinejoy0419.github.io/PJ-Party/`.

Every submission lands as a row on the Sheet's **Recipes** tab and arrives in Kristine's inbox. To fix or remove an entry, edit the row in the Sheet.
