const MIN_WORDS = 200;
const LETTERS = ["A", "B", "C", "D"];

const app = document.getElementById("app");

let settings = null;
// The quiz for the current page. It is saved in session storage so that the
// quiz and your answers stay when the popup closes and opens again.
let state = null;

// Creates an element. Text children become text nodes, so model output is
// never parsed as HTML.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function show(...nodes) {
  app.replaceChildren(...nodes);
}

function showLoading(title, detail) {
  show(el("div", { class: "status" }, el("div", { class: "spinner", role: "progressbar" }), el("h2", {}, title), detail && el("p", {}, detail)));
}

function openOptions() {
  browser.runtime.openOptionsPage();
  window.close();
}

function showMessage({ icon, title, message, actions = [] }) {
  show(
    el(
      "div",
      { class: "status" },
      icon && el("div", { class: "icon", "aria-hidden": "true" }, icon),
      el("h2", {}, title),
      el("p", {}, message),
      actions.length > 0 && el("div", { class: "actions" }, actions)
    )
  );
}

function showError(err, retry) {
  const actions = [];
  if (retry) actions.push(el("button", { class: "btn", onclick: retry }, "Try again"));
  if (err.openOptions) actions.push(el("button", { class: "btn secondary", onclick: openOptions }, "Open settings"));
  showMessage({
    icon: "⚠️",
    title: err.title || "Something went wrong",
    message: err.message || String(err),
    actions,
  });
}

// ---- Session cache -------------------------------------------------------

const cacheKey = (url) => `quiz:${url}`;

async function loadCached(url) {
  if (!browser.storage.session) return null;
  try {
    const data = await browser.storage.session.get(cacheKey(url));
    return data[cacheKey(url)] || null;
  } catch (e) {
    return null;
  }
}

async function saveState() {
  if (!browser.storage.session || !state) return;
  try {
    await browser.storage.session.set({ [cacheKey(state.article.url)]: state });
  } catch (e) {
    // The quiz still works. It is only lost when the popup closes.
  }
}

// ---- Main flow -----------------------------------------------------------

async function start({ fresh = false } = {}) {
  settings = await loadSettings();
  if (!settings.apiKey) {
    showMessage({
      icon: "🔑",
      title: "Add your API key",
      message: "Article Quiz uses your own Anthropic API key to write questions. Add the key on the settings page.",
      actions: [el("button", { class: "btn", onclick: openOptions }, "Open settings")],
    });
    return;
  }

  showLoading("Reading the article…");

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    showError({ title: "No tab", message: "Could not find the current tab." }, () => start());
    return;
  }

  if (!fresh && tab.url) {
    const cached = await loadCached(tab.url);
    if (cached) {
      state = cached;
      renderQuiz();
      return;
    }
  }

  let article;
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["/lib/Readability.js", "/content/extract.js"],
    });
    article = result && result.result;
  } catch (e) {
    showMessage({
      icon: "🚫",
      title: "Can't read this page",
      message:
        "Firefox does not let extensions read this page. This applies to browser pages, Reader View, the add-ons site, and some PDF views. Open a normal article page and try again.",
    });
    return;
  }

  if (!article || !article.text) {
    showMessage({ icon: "📄", title: "No text found", message: "This page has no readable text." });
    return;
  }

  const words = article.text.split(/\s+/).filter(Boolean).length;
  if (words < MIN_WORDS) {
    showMessage({
      icon: "📄",
      title: "This doesn't look like an article",
      message: `The page has only about ${words} words of text. Open a full article and try again.`,
    });
    return;
  }

  const truncated = article.text.length > MAX_ARTICLE_CHARS;
  article = { ...article, text: truncateArticle(article.text), truncated };

  await generate(article);
}

async function generate(article) {
  showLoading("Writing your questions…", "This usually takes 5 to 20 seconds.");
  try {
    const quiz = await generateQuiz(settings, article);
    state = {
      article,
      quiz,
      mcAnswers: quiz.multipleChoice.map(() => null),
      openAnswer: "",
      feedback: null,
    };
    await saveState();
    renderQuiz();
  } catch (err) {
    showError(err, () => generate(article));
  }
}

// ---- Quiz rendering ------------------------------------------------------

function renderQuiz() {
  const { article, quiz } = state;
  const nodes = [
    el(
      "header",
      { class: "header" },
      el("div", {}, el("p", { class: "label" }, "Quiz on"), el("h1", {}, article.title || "This page")),
      el("button", { class: "btn secondary", title: "Read the page again and write new questions", onclick: () => start({ fresh: true }) }, "New quiz")
    ),
  ];
  if (article.truncated) {
    nodes.push(el("p", { class: "notice" }, "This article is very long. The questions cover only about the first 60,000 characters."));
  }
  if (article.source === "body") {
    nodes.push(el("p", { class: "notice" }, "Could not find a clear article on this page, so the questions use all the text on the page."));
  }
  quiz.multipleChoice.forEach((_, i) => nodes.push(mcCard(i)));
  nodes.push(openCard());
  nodes.push(scoreCard());
  show(...nodes);
}

function replace(id, node) {
  document.getElementById(id).replaceWith(node);
}

function mcCard(i) {
  const q = state.quiz.multipleChoice[i];
  const chosen = state.mcAnswers[i];
  const answered = chosen !== null;

  const options = q.options.map((text, j) => {
    let cls = "option";
    if (answered && j === q.correct_index) cls += " correct";
    else if (answered && j === chosen) cls += " wrong";
    return el(
      "button",
      { class: cls, disabled: answered, onclick: () => answerMc(i, j) },
      el("span", { class: "letter" }, LETTERS[j]),
      el("span", {}, text)
    );
  });

  let result = null;
  if (answered) {
    const ok = chosen === q.correct_index;
    result = el(
      "p",
      { class: "result" },
      el("strong", { class: ok ? "ok" : "bad" }, ok ? "Correct. " : `Not quite. The answer is ${LETTERS[q.correct_index]}. `),
      q.explanation
    );
  }

  return el(
    "section",
    { class: "question", id: `mc-${i}` },
    el("p", { class: "num" }, `Question ${i + 1} of 4`),
    el("p", { class: "prompt" }, q.question),
    el("div", { class: "options" }, options),
    result
  );
}

function answerMc(i, j) {
  if (state.mcAnswers[i] !== null) return;
  state.mcAnswers[i] = j;
  saveState();
  replace(`mc-${i}`, mcCard(i));
  replace("score", scoreCard());
}

function openCard({ checking = false, error = null } = {}) {
  const q = state.quiz.open;
  const fb = state.feedback;

  const textarea = el("textarea", {
    id: "open-answer",
    placeholder: "Write a few sentences in your own words…",
    value: state.openAnswer,
    disabled: checking,
    oninput: (e) => {
      state.openAnswer = e.target.value;
      checkBtn.disabled = !e.target.value.trim();
      saveState();
    },
  });
  textarea.setAttribute("aria-label", "Your answer");

  const checkBtn = el(
    "button",
    { class: "btn", disabled: checking || !state.openAnswer.trim(), onclick: checkOpen },
    checking && el("span", { class: "spinner" }),
    checking ? "Checking…" : fb ? "Check again" : "Check"
  );

  return el(
    "section",
    { class: "question", id: "open" },
    el("p", { class: "num" }, "Question 4 of 4 · Written answer"),
    el("p", { class: "prompt" }, q.question),
    textarea,
    el("div", { class: "open-actions" }, checkBtn, !fb && !checking && el("span", { class: "hint" }, "2 to 4 sentences is enough.")),
    error && el("div", { class: "inline-error", role: "alert" }, `${error.title}: ${error.message}`),
    fb && feedbackBlock(fb)
  );
}

function feedbackBlock(fb) {
  return el(
    "div",
    { class: "feedback" },
    el("p", { class: `verdict ${fb.gotMainPoint ? "ok" : "bad"}` }, fb.gotMainPoint ? "✓ You got the main point. " : "✗ You missed the main point. ", fb.verdict),
    fb.gotRight && [el("h3", {}, "What you got right"), el("p", {}, fb.gotRight)],
    fb.missed && [el("h3", {}, "What you missed"), el("p", {}, fb.missed)],
    el("h3", {}, "Model answer"),
    el("p", {}, fb.modelAnswer)
  );
}

async function checkOpen() {
  const answer = state.openAnswer.trim();
  if (!answer) return;
  replace("open", openCard({ checking: true }));
  try {
    state.feedback = await checkOpenAnswer(settings, state.article, state.quiz.open.question, state.quiz.open.keyPoints, answer);
    await saveState();
    replace("open", openCard());
    replace("score", scoreCard());
  } catch (err) {
    replace("open", openCard({ error: err }));
  }
}

function scoreCard() {
  const total = state.quiz.multipleChoice.length;
  const answered = state.mcAnswers.filter((a) => a !== null).length;
  if (answered < total) {
    return el(
      "section",
      { class: "score", id: "score" },
      el("span", { class: "sub" }, `Answer all ${total} multiple-choice questions to see your score (${answered} of ${total} answered).`)
    );
  }
  const correct = state.mcAnswers.filter((a, i) => a === state.quiz.multipleChoice[i].correct_index).length;
  const comment = correct === total ? "You clearly read it." : correct === 0 ? "Maybe read it again?" : "Not bad.";
  return el(
    "section",
    { class: "score", id: "score" },
    el("span", { class: "sub" }, "Multiple-choice score"),
    el("span", { class: "big" }, `${correct}/${total}`),
    el("span", { class: "sub" }, state.feedback ? comment : `${comment} Don't forget the written question.`)
  );
}

start().catch((err) => showError(err, () => start()));
