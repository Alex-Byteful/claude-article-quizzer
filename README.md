# Article Quiz

A Firefox extension that tests whether you read the article in the current tab.

Click the toolbar button. The extension reads the article and sends it to Claude through your own Anthropic API key. Claude writes 4 questions about the article:

- 3 multiple-choice questions. Click an option to see if it is correct, which option is correct, and a one-sentence explanation.
- 1 written question. Type a short answer and click **Check**. Claude tells you if you got the main point, what you missed, and gives a model answer.

At the end, the popup shows your multiple-choice score, for example `2/3`.

The quiz and your answers stay in the popup while the browser is open. To get new questions for the same page, click **New quiz**.

## Project layout

```
extension/
  manifest.json          Manifest V3, with the Firefox add-on ID
  popup/                 Toolbar popup: quiz UI and flow
  options/               Settings page: API key and model
  content/extract.js     Runs in the tab and extracts the article text
  lib/api.js             Anthropic API calls, prompts, and JSON parsing
  lib/Readability.js     Mozilla Readability 0.6.0, bundled (Apache-2.0)
  styles/base.css        Shared colours for light and dark mode
  icons/                 Toolbar icon (icon.svg is the source)
```

The extension has no build step. The files in `extension/` are the extension.

## How it works

1. When the popup opens, it uses `browser.scripting.executeScript` to run `lib/Readability.js` and `content/extract.js` in the active tab. The `activeTab` permission gives access to the tab only after you click the toolbar button.
2. If Readability finds no article, the script uses `document.body.innerText`. If the page has fewer than 200 words, the popup shows "This doesn't look like an article".
3. The popup cuts articles longer than 60,000 characters and tells you that it did.
4. The popup calls `https://api.anthropic.com/v1/messages` with `fetch`. The prompt asks for JSON only. The parser removes ```` ```json ```` fences and checks the format. If the format is wrong, the popup shows an error and a **Try again** button.
5. The popup shuffles the options of each multiple-choice question, because models often put the correct answer in the same position.

### Permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Read the current tab, only after you click the toolbar button |
| `scripting` | Run the extraction script in that tab |
| `storage` | Keep your API key, model, and the current quiz |
| `https://api.anthropic.com/*` | Call the Anthropic API. This is the only host the extension contacts |

## 1. Get an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign in or create an account.
2. Add credits on the **Billing** page. The API does not work without credits.
3. Open **API keys** ([console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)).
4. Click **Create key**, give it a name such as `article-quiz`, and copy the key. The key starts with `sk-ant-`. The console shows the key only once.

Cost: with the default model, `claude-haiku-5-5`, one quiz on a long article costs a fraction of a cent.

Security: the extension keeps the key in `browser.storage.local` in your Firefox profile. It sends the key only to `api.anthropic.com`. Any person or program with access to your Firefox profile can read the key. If you want a limit, set a monthly spend limit for the key's workspace in the console.

## 2. Load the extension temporarily

Use this to try the extension or to develop it. Firefox removes a temporary add-on when it closes.

1. Open Firefox and go to `about:debugging`.
2. Click **This Firefox** in the left column.
3. Click **Load Temporary Add-on…**.
4. Select `extension/manifest.json` in this repository.
5. The Article Quiz icon appears in the toolbar. If it does not, click the puzzle-piece (Extensions) button and pin **Article Quiz**.
6. Click the icon. The popup asks for an API key. Click **Open settings**, paste your key, and click **Save**.

To load your changes after you edit a file, click **Reload** next to the add-on on the `about:debugging` page.

To debug the popup, click **Inspect** next to the add-on on the `about:debugging` page.

## 3. Package and submit to addons.mozilla.org as unlisted

Release Firefox installs only signed add-ons permanently. Mozilla signs unlisted add-ons automatically. An unlisted add-on does not appear on the public add-ons site. Only people with the file can install it.

### Option A: web-ext (command line)

1. Install [web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/):

   ```bash
   npm install --global web-ext
   ```

2. Check the extension for problems:

   ```bash
   web-ext lint --source-dir extension
   ```

3. Create API credentials at [addons.mozilla.org/developers/addon/api/key/](https://addons.mozilla.org/developers/addon/api/key/). You get a JWT issuer and a JWT secret.

4. Sign the extension as unlisted:

   ```bash
   web-ext sign --source-dir extension --channel unlisted --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
   ```

5. web-ext writes the signed `.xpi` file into `web-ext-artifacts/`.

### Option B: the Developer Hub website

1. Make a zip file of the contents of `extension/`. `manifest.json` must be at the root of the zip, not inside a folder:

   ```bash
   cd extension && zip -r -FS ../article-quiz.zip . -x '.*' && cd ..
   ```

2. Go to [addons.mozilla.org/developers/](https://addons.mozilla.org/developers/) and sign in.
3. Click **Submit a New Add-on**.
4. Select **On your own** (this is the unlisted channel).
5. Upload `article-quiz.zip` and follow the steps. Mozilla can ask for source code. The extension has no build step and no minified code, so the zip is the source.
6. After the automatic review, download the signed `.xpi` file.

### Install the signed file

1. In Firefox, open `about:addons`.
2. Click the gear button and select **Install Add-on From File…**.
3. Select the signed `.xpi` file.

The add-on now stays installed when Firefox restarts. For each new version, increase `version` in `extension/manifest.json` and sign again. Do not change `browser_specific_settings.gecko.id`, because Firefox uses it to identify the add-on for updates.

### Notes for the submission

- The manifest declares `data_collection_permissions` with `websiteContent`, because the extension sends page text to the Anthropic API. Addons.mozilla.org requires this key for new submissions. Firefox versions before 140 ignore it with a warning.
- The bundled `lib/Readability.js` is the unmodified file from the npm package `@mozilla/readability` 0.6.0. Its license is in `lib/Readability.LICENSE.md`.

## Settings

Open the settings page from the popup, or from `about:addons` → Article Quiz → **Preferences**.

- **Anthropic API key**: required.
- **Model**: default `claude-haiku-5-5` (fast and cheap). For better questions, choose `claude-sonnet-5-5` or `claude-opus-5-5`. You can type any model ID.

## Troubleshooting

| Message | Cause and fix |
| --- | --- |
| Add your API key | No key is saved. Click **Open settings** and save a key. |
| Invalid API key | Anthropic did not accept the key (HTTP 401). Copy the key again from the console. |
| Model not found | The model ID is wrong, or your key cannot use it. Correct it on the settings page. |
| Rate limit reached | Too many requests, or no credits left (HTTP 429). Wait a minute, or add credits. |
| Network error | Firefox could not connect to `api.anthropic.com`. Check your connection, VPN, or proxy. |
| Can't read this page | Firefox does not let extensions read some pages: `about:` pages, Reader View, `addons.mozilla.org`, and some PDF views. Open the normal page view. |
| This doesn't look like an article | The page has fewer than 200 words of text. |
| Unreadable response | The model did not return valid JSON. Click **Try again**. |
