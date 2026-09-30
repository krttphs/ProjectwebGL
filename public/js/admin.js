// ===== เรียก Express API (/api/admin/*) โดยใช้ cookie "token" ที่ login ไว้แล้ว =====
async function api(method, path, body) {
    const res = await fetch('/api/admin' + path, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) location.href = '/login';
    if (!res.ok) throw new Error(json.error || res.statusText);
    return json;
}

const $ = (id) => document.getElementById(id);
const QUEST_TEXT = ['title', 'description', 'input_run', 'input_submit', 'expected_output',
    'show_expect_output', 'setup_code_python', 'setup_code_js', 'setup_code_java'];

let quests = [], langs = [], editingQuest = null, editingLang = null;

// ===== ตรวจสิทธิ์: ต้อง login และ role = admin (RLS ฝั่ง DB เป็นด่านจริง) =====
async function init() {
    try { await api('GET', '/me'); }
    catch (e) {
        $('gate').textContent = 'You do not have permission to view this page.';
        return;
    }
    $('gate').hidden = true;
    $('app').hidden = false;
    await Promise.all([loadQuests(), loadLangs()]);
}

// ===== Tabs =====
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
    ['quests', 'languages'].forEach((n) => ($('tab-' + n).hidden = n !== b.dataset.tab));
}));

// ===== helpers =====
function cell(tr, text, cls) {
    const td = document.createElement('td');
    if (cls) td.className = cls;
    td.textContent = text ?? '';
    tr.appendChild(td);
    return td;
}
function actions(tr, onEdit, onDelete) {
    const td = cell(tr, '', 'act');
    const e = Object.assign(document.createElement('button'), { textContent: 'Edit', className: 'ghost small' });
    const d = Object.assign(document.createElement('button'), { textContent: 'Delete', className: 'danger small' });
    e.onclick = onEdit; d.onclick = onDelete;
    td.append(e, d);
}
function emptyRow(tbody, cols, text) {
    const tr = document.createElement('tr');
    const td = cell(tr, text, 'empty');
    td.colSpan = cols;
    tbody.appendChild(tr);
}

// ===== Quests =====
async function loadQuests() {
    try { quests = await api('GET', '/quests'); } catch (e) { return alert(e.message); }
    const body = $('questRows');
    body.innerHTML = '';
    if (!quests.length) return emptyRow(body, 5, 'No quests yet. Add the first one.');
    quests.forEach((q) => {
        const tr = document.createElement('tr');
        cell(tr, q.title);
        const lv = cell(tr, '');
        lv.innerHTML = '<span class="badge"></span>';
        lv.firstChild.textContent = q.level;
        lv.firstChild.classList.add(q.level);
        cell(tr, q.rewards);
        cell(tr, q.is_active ? 'Yes' : 'No');
        actions(tr, () => openQuest(q), () => deleteQuest(q));
        body.appendChild(tr);
    });
}

function openQuest(q) {
    editingQuest = q || null;
    $('questDlgTitle').textContent = q ? 'Edit quest' : 'Add quest';
    QUEST_TEXT.forEach((k) => ($('q_' + k).value = q?.[k] ?? ''));
    $('q_level').value = q?.level ?? 'easy';
    $('q_rewards').value = q?.rewards ?? 0;
    $('q_is_active').checked = q?.is_active ?? true;
    $('questErr').textContent = '';
    $('questDlg').showModal();
}

async function saveQuest() {
    const row = { level: $('q_level').value, rewards: parseInt($('q_rewards').value, 10) || 0, is_active: $('q_is_active').checked };
    QUEST_TEXT.forEach((k) => (row[k] = $('q_' + k).value));
    if (!row.title.trim()) return ($('questErr').textContent = 'Title is required.');
    try { await (editingQuest ? api('PUT', '/quests/' + editingQuest.id, row) : api('POST', '/quests', row)); }
    catch (e) { return ($('questErr').textContent = e.message); }
    $('questDlg').close();
    loadQuests();
}

async function deleteQuest(q) {
    if (!confirm(`Delete quest "${q.title}"? This cannot be undone.`)) return;
    try { await api('DELETE', '/quests/' + q.id); } catch (e) { return alert(e.message); }
    loadQuests();
}

// ===== Languages =====
async function loadLangs() {
    try { langs = await api('GET', '/languages'); } catch (e) { return alert(e.message); }
    const body = $('langRows');
    body.innerHTML = '';
    if (!langs.length) return emptyRow(body, 4, 'No languages yet. Add the first one.');
    langs.forEach((l) => {
        const tr = document.createElement('tr');
        cell(tr, l.id); cell(tr, l.name); cell(tr, l.judge0_id);
        actions(tr, () => openLang(l), () => deleteLang(l));
        body.appendChild(tr);
    });
}

function openLang(l) {
    editingLang = l || null;
    $('langDlgTitle').textContent = l ? 'Edit language' : 'Add language';
    $('l_name').value = l?.name ?? '';
    $('l_judge0_id').value = l?.judge0_id ?? '';
    $('langErr').textContent = '';
    $('langDlg').showModal();
}

async function saveLang() {
    const name = $('l_name').value.trim();
    const judge0_id = parseInt($('l_judge0_id').value, 10);
    if (!name || Number.isNaN(judge0_id)) return ($('langErr').textContent = 'Name and Judge0 ID are required.');
    const row = { name, judge0_id };
    try { await (editingLang ? api('PUT', '/languages/' + editingLang.id, row) : api('POST', '/languages', row)); }
    catch (e) { return ($('langErr').textContent = e.message); }
    $('langDlg').close();
    loadLangs();
}

async function deleteLang(l) {
    if (!confirm(`Delete language "${l.name}"?`)) return;
    try { await api('DELETE', '/languages/' + l.id); } catch (e) { return alert(e.message); }
    loadLangs();
}

// ===== wiring =====
$('newQuest').onclick = () => openQuest();
$('questSave').onclick = saveQuest;
$('questCancel').onclick = () => $('questDlg').close();
$('newLang').onclick = () => openLang();
$('langSave').onclick = saveLang;
$('langCancel').onclick = () => $('langDlg').close();

init();
