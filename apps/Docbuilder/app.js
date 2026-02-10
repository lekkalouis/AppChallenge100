const templateSelect = document.getElementById('template-select');
const docList = document.getElementById('doc-list');
const templateList = document.getElementById('template-list');
const editorTitle = document.getElementById('editor-title');
const editor = document.getElementById('editor');
const statusText = document.getElementById('status');

const docCount = document.getElementById('doc-count');
const templateCount = document.getElementById('template-count');
const completedCount = document.getElementById('completed-count');

const newDocForm = document.getElementById('new-doc-form');
const newTemplateForm = document.getElementById('new-template-form');
const saveDocBtn = document.getElementById('save-doc');
const downloadDocBtn = document.getElementById('download-doc');
const toggleCompleteBtn = document.getElementById('toggle-complete');

const STORAGE_KEY = 'app2.businessAtlas';

const defaultTemplates = {
  'Business Atlas': ['Mission', 'Core Offer', 'Target Customer', 'Operating Model', 'KPIs', 'Current Risks', 'Next 90 Days'],
  'SOP Builder': ['SOP Name', 'Scope', 'Owner', 'Tools Needed', 'Step-by-step Procedure', 'Failure Modes', 'Escalation Rules'],
  'Pricing Strategy': ['Pricing Objective', 'Current Tiers', 'Guardrails', 'Discount Rules', 'Review Cadence'],
};

const generateMarkdown = (title, sections) => {
  const lines = [`# ${title}`, ''];
  sections.forEach((section) => {
    lines.push(`## ${section}`, '- ', '');
  });
  return lines.join('\n');
};

const initialState = {
  templates: Object.entries(defaultTemplates).map(([name, sections]) => ({ name, sections })),
  docs: [],
};

const getState = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return initialState;
  try {
    const parsed = JSON.parse(raw);
    return {
      templates: parsed.templates ?? initialState.templates,
      docs: parsed.docs ?? [],
    };
  } catch {
    return initialState;
  }
};

let state = getState();
let activeDocId = null;

const setState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const updateStats = () => {
  docCount.textContent = String(state.docs.length);
  templateCount.textContent = String(state.templates.length);
  completedCount.textContent = String(state.docs.filter((d) => d.completed).length);
};

const renderTemplates = () => {
  templateSelect.innerHTML = '';
  templateList.innerHTML = '';

  state.templates.forEach((template, idx) => {
    const option = document.createElement('option');
    option.value = String(idx);
    option.textContent = template.name;
    templateSelect.appendChild(option);

    const li = document.createElement('li');
    li.innerHTML = `<div><strong>${template.name}</strong><div class="doc-meta">${template.sections.join(' · ')}</div></div>`;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ghost';
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      state.templates = state.templates.filter((_, i) => i !== idx);
      setState();
      render();
    });
    li.appendChild(del);
    templateList.appendChild(li);
  });
};

const openDoc = (id) => {
  activeDocId = id;
  const doc = state.docs.find((d) => d.id === id);
  if (!doc) return;
  editorTitle.textContent = doc.name;
  editor.value = doc.content;
  toggleCompleteBtn.textContent = doc.completed ? 'Mark incomplete' : 'Mark complete';
  statusText.textContent = doc.updatedAt ? `Last saved: ${new Date(doc.updatedAt).toLocaleString()}` : 'Unsaved.';
  renderDocs();
};

const renderDocs = () => {
  docList.innerHTML = '';

  state.docs.forEach((doc) => {
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.innerHTML = `<strong>${doc.name}</strong><div class="doc-meta">${doc.templateName} · ${doc.completed ? 'Completed' : 'In progress'}</div>`;

    const row = document.createElement('div');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = activeDocId === doc.id ? '' : 'ghost';
    open.textContent = 'Open';
    open.addEventListener('click', () => openDoc(doc.id));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ghost';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      state.docs = state.docs.filter((d) => d.id !== doc.id);
      if (activeDocId === doc.id) {
        activeDocId = null;
        editorTitle.textContent = 'Select a document';
        editor.value = '';
      }
      setState();
      render();
    });

    row.append(open, remove);
    li.append(left, row);
    docList.appendChild(li);
  });
};

newDocForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(newDocForm);
  const name = String(formData.get('name')).trim();
  const templateIndex = Number(formData.get('template'));
  const template = state.templates[templateIndex];
  if (!name || !template) return;

  const doc = {
    id: String(Date.now()),
    name,
    templateName: template.name,
    completed: false,
    content: generateMarkdown(name, template.sections),
    updatedAt: null,
  };

  state.docs = [doc, ...state.docs];
  setState();
  render();
  openDoc(doc.id);
  newDocForm.reset();
});

newTemplateForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(newTemplateForm);
  const name = String(formData.get('name')).trim();
  const sections = String(formData.get('sections'))
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (!name || sections.length === 0) return;

  state.templates = [...state.templates, { name, sections }];
  setState();
  render();
  newTemplateForm.reset();
});

saveDocBtn.addEventListener('click', () => {
  const doc = state.docs.find((d) => d.id === activeDocId);
  if (!doc) {
    statusText.textContent = 'Select a document first.';
    return;
  }
  doc.content = editor.value;
  doc.updatedAt = Date.now();
  setState();
  statusText.textContent = `Saved ${doc.name}.`;
});

downloadDocBtn.addEventListener('click', () => {
  const doc = state.docs.find((d) => d.id === activeDocId);
  if (!doc) {
    statusText.textContent = 'Select a document first.';
    return;
  }
  const blob = new Blob([editor.value], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${doc.name.replace(/\s+/g, '_')}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
  statusText.textContent = `Downloaded ${doc.name}.`;
});

toggleCompleteBtn.addEventListener('click', () => {
  const doc = state.docs.find((d) => d.id === activeDocId);
  if (!doc) {
    statusText.textContent = 'Select a document first.';
    return;
  }
  doc.completed = !doc.completed;
  setState();
  render();
  openDoc(doc.id);
});

const render = () => {
  renderTemplates();
  renderDocs();
  updateStats();
};

render();
