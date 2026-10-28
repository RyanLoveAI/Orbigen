import * as T from 'three';
import { recipe, SPECIES, MAX_PLANTS, validateInstances } from './schema.js';
import { generatePlant, disposePlant } from './generator.js';
import { createRng } from './engine/branch-kernel.js';
import { exportGLB } from '../../view.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const send = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export class VegetationWorkspace {
  constructor({ api, stage, notify, safe, download, active }) {
    Object.assign(this, { api, stage, notify, safe, download, active });
    this.models = new Map(); this.selected = null; this.history = []; this.future = []; this.dirty = 0; this.saved = 0; this.epoch = 0; this.mode = 'preview';
    try { this.config = recipe('CAMPHOR', JSON.parse(localStorage.getItem('orbigen-vegetation-controls') || '{}')); } catch { this.config = recipe(); }
  }
  async ensure() {
    if (this.project) return;
    this.projects = await this.api('/api/modules/vegetation/projects');
    const id = localStorage.getItem('orbigen-vegetation-last');
    const current = this.projects.find(p => p.id === id) || this.projects[0];
    this.project = current ? await this.api('/api/modules/vegetation/projects/' + current.id) : await this.api('/api/modules/vegetation/projects', send('POST', { name: '我的植被搭配' }));
    localStorage.setItem('orbigen-vegetation-last', this.project.id);
    await this.restoreDraft();
    this.projects = await this.api('/api/modules/vegetation/projects');
  }
  draftKey() { return 'orbigen-vegetation-draft-' + this.project.id; }
  async restoreDraft() {
    const raw = localStorage.getItem(this.draftKey());
    if (!raw) return;
    const draft = JSON.parse(raw); validateInstances(draft.instances);
    if (!confirm('发现未提交的植被修改，是否恢复？')) { localStorage.removeItem(this.draftKey()); return; }
    if (draft.revision !== this.project.revision) this.project = await this.api('/api/modules/vegetation/projects', send('POST', { name: draft.name + ' · 恢复副本' }));
    this.project.instances = draft.instances; this.mark();
  }
  changed() { return this.dirty !== this.saved; }
  status(text) { if (this.active() && $('#plant-save-status')) $('#plant-save-status').textContent = text; }
  mark() {
    this.dirty++; localStorage.setItem(this.draftKey(), JSON.stringify(this.project));
    clearTimeout(this.timer); this.timer = setTimeout(() => this.safe(() => this.save()), 1000); this.status('等待保存…');
  }
  remember() { this.history.push(structuredClone(this.project.instances)); if (this.history.length > 40) this.history.shift(); this.future = []; }
  async save() {
    if (!this.project) return;
    if (this.savePromise) { await this.savePromise; return this.save(); }
    if (!this.changed()) return;
    const project = this.project, revision = project.revision, sequence = this.dirty, snapshot = structuredClone(project);
    this.status('保存中…');
    this.savePromise = this.api('/api/modules/vegetation/projects/' + project.id, send('PUT', { ...snapshot, baseRevision: revision }));
    try {
      const next = await this.savePromise; project.revision = next.revision; project.updatedAt = next.updatedAt; this.saved = sequence;
      if (!this.changed()) { localStorage.removeItem('orbigen-vegetation-draft-' + project.id); this.status('已保存'); }
      else { localStorage.setItem(this.draftKey(), JSON.stringify(project)); clearTimeout(this.timer); this.timer = setTimeout(() => this.safe(() => this.save()), 200); }
    } catch (error) { this.status('未保存 · 草稿已保留'); throw error; } finally { this.savePromise = null; }
  }
  async mount() {
    await this.ensure(); while (this.busy) await new Promise(resolve => setTimeout(resolve, 40)); if (!this.active()) return;
    this.render();
    if (this.project.instances.length) { this.mode = 'scene'; await this.rebuild(true); }
    else await this.generate();
  }
  render() {
    $('#main').innerHTML = `<section class="page-heading"><div><span class="eyebrow">VEGETATION / 植被</span><h1>植被生成与搭配</h1><p class="subtitle">选一株植物，生成自己的变体，再搭配成一处花草景观。</p></div><div class="heading-actions plant-actions"><span id="plant-save-status">${this.changed() ? '等待保存' : '已保存'}</span><button id="plant-undo">撤销</button><button id="plant-redo">重做</button><button id="plant-save">保存</button><button id="plant-new-project">新建植被工程</button><button id="plant-save-as">另存副本</button><button id="plant-export" class="primary">导出场景 GLB</button><button id="plant-package">工程包</button></div></section>
    <div class="plant-project-bar"><label>植被工程 <select id="plant-projects">${this.projects.map(p => `<option value="${p.id}" ${p.id === this.project.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><input id="plant-project-name" aria-label="植被工程名称" value="${esc(this.project.name)}" maxlength="120"><button id="plant-import-package">导入植被工程</button><input id="plant-package-input" type="file" accept=".json,.plantkit" hidden><span>建筑工程独立保存</span></div>
    <div class="editor plant-editor"><section class="panel"><h3>选择植物</h3><div class="plant-catalog">${Object.entries(SPECIES).map(([id, p]) => `<button data-plant-species="${id}" class="${this.config.species === id ? 'active' : ''}"><b>${p.name}</b><span>${p.category} · ${p.description}</span></button>`).join('')}</div><h3>生成参数</h3><label class="field"><span>高度（m）</span><input id="plant-height" type="number" min=".05" max="15" step=".05" value="${this.config.height}"></label><label class="field"><span>冠幅 / 丛宽</span><input id="plant-width" type="range" min=".4" max="2" step=".05" value="${this.config.width}"></label><label class="field"><span>枝叶疏密</span><input id="plant-density" type="range" min=".25" max="1.5" step=".05" value="${this.config.density}"></label><label class="field"><span>生成种子</span><input id="plant-seed" type="number" min="1" max="2147483646" step="1" value="${this.config.seed}"></label><div class="panel-buttons"><button id="plant-generate" class="primary">生成预览</button><button id="plant-variant">换个样子</button></div><button id="plant-add" class="primary full-width">＋ 加入搭配</button><p id="plant-generation-status">正在准备植物…</p><h3>成批搭配</h3><div class="triple"><label>数量<input id="plant-count" type="number" min="1" max="30" value="8"></label><label>范围（m）<input id="plant-radius" type="number" min=".2" max="30" step=".5" value="4"></label></div><button id="plant-scatter" class="full-width">加入一片植物</button><p>随机位置、朝向与大小；添加后可以逐株移动。</p></section>
    <section class="stage-shell"><div class="stage-toolbar"><button id="plant-view-preview">单株预览</button><button id="plant-view-scene">搭配场景</button><button id="plant-fit">适应视图 F</button><button id="plant-move">移动 W</button><button id="plant-rotate">旋转 E</button></div><div class="stage" id="plant-stage"></div><div class="stage-caption"><span>左键观察 · 右键平移 · 滚轮缩放</span><span id="plant-scene-stats"></span></div></section>
    <section class="panel"><h3>场景植物 <span id="plant-object-count">${this.project.instances.length}</span></h3><div class="object-list" id="plant-objects"></div><h3>植物属性</h3><div id="plant-properties"><p>点击场景中的植物或对象列表进行编辑。</p></div></section></div>`;
    this.stage.mount($('#plant-stage')); this.stage.auto = false; this.stage.explode = 0; this.stage.setMode('material');
    const bind = (id, fn) => $('#' + id).onclick = () => this.safe(fn);
    document.querySelectorAll('[data-plant-species]').forEach(button => button.onclick = () => this.safe(async () => {
      if (this.busy) return; this.config = recipe(button.dataset.plantSpecies, { seed: this.config.seed }); this.updateControls(); await this.generate();
    }));
    bind('plant-generate', () => this.generate()); bind('plant-variant', async () => { if (this.busy) return; $('#plant-seed').value = 1 + crypto.getRandomValues(new Uint32Array(1))[0] % 2147483645; await this.generate(); });
    bind('plant-add', () => this.add(1)); bind('plant-scatter', () => this.add(Number($('#plant-count').value), Number($('#plant-radius').value)));
    bind('plant-view-preview', async () => { if (!this.preview) await this.generate(); else { this.mode = 'preview'; await this.rebuild(true); } });
    bind('plant-view-scene', async () => { this.mode = 'scene'; await this.rebuild(true); });
    bind('plant-fit', () => this.stage.fit()); bind('plant-move', () => this.stage.transform.setMode('translate')); bind('plant-rotate', () => this.stage.transform.setMode('rotate'));
    bind('plant-save', async () => { await this.save(); this.notify('植被工程已保存'); });
    bind('plant-undo', () => this.undo()); bind('plant-redo', () => this.undo(true));
    bind('plant-export', () => this.exportScene()); bind('plant-package', () => this.exportPackage());
    bind('plant-new-project', () => this.create()); bind('plant-save-as', () => this.create(true));
    $('#plant-projects').onchange = event => this.safe(() => this.open(event.target.value));
    $('#plant-project-name').onchange = event => { this.project.name = event.target.value.trim() || '植被搭配'; this.mark(); };
    bind('plant-import-package', () => $('#plant-package-input').click());
    $('#plant-package-input').onchange = event => this.safe(async () => { const file = event.target.files[0]; event.target.value = ''; if (file) await this.importPackage(file); });
    this.list(); this.setBusy(false);
  }
  updateControls() {
    for (const field of ['height', 'width', 'density', 'seed']) $('#plant-' + field).value = this.config[field];
    document.querySelectorAll('[data-plant-species]').forEach(b => b.classList.toggle('active', b.dataset.plantSpecies === this.config.species));
  }
  readControls() { return recipe(this.config.species, Object.fromEntries(['height', 'width', 'density', 'seed'].map(key => [key, Number($('#plant-' + key).value)]))); }
  setBusy(value) { this.busy = value; if (!this.active()) return; for (const id of ['plant-generate', 'plant-variant', 'plant-add', 'plant-scatter']) $('#' + id).disabled = value; }
  async model(config) {
    const key = JSON.stringify(config);
    if (!this.models.has(key)) this.models.set(key, generatePlant(config).catch(error => { this.models.delete(key); throw error; }));
    return this.models.get(key);
  }
  async generate() {
    if (this.busy) return;
    const config = this.readControls(), epoch = this.epoch;
    this.setBusy(true); $('#plant-generation-status').textContent = '正在生成 ' + SPECIES[config.species].name + '…';
    try {
      const plant = await this.model(config); if (!this.active() || epoch !== this.epoch) return;
      this.config = config; this.preview = plant; this.mode = 'preview'; localStorage.setItem('orbigen-vegetation-controls', JSON.stringify(config));
      $('#plant-generation-status').textContent = SPECIES[config.species].name + ' · ' + plant.triangles.toLocaleString() + ' 三角面 · 可加入搭配';
      await this.rebuild(true);
    } catch (error) { if (this.active()) $('#plant-generation-status').textContent = '生成未完成：' + error.message; throw error; }
    finally { this.setBusy(false); }
  }
  async scene(instances = this.project.instances) {
    const group = new T.Group(); group.name = this.project.name; let triangles = 0;
    for (const instance of instances) {
      const model = await this.model(instance.recipe), root = model.root.clone(true); triangles += model.triangles;
      root.name = instance.name; root.position.fromArray(instance.position); root.rotation.fromArray([...instance.rotation, 'XYZ']); root.scale.fromArray(instance.scale);
      root.userData = { instanceId: instance.id, basePosition: instance.position.slice(), unitScale: 1, recipe: instance.recipe }; group.add(root);
    }
    return { group, triangles };
  }
  async rebuild(fit = false) {
    const epoch = ++this.epoch, camera = this.stage.camera.position.clone(), target = this.stage.orbit.target.clone();
    let group, triangles;
    if (this.mode === 'preview' && this.preview) { group = new T.Group(); group.add(this.preview.root.clone(true)); triangles = this.preview.triangles; }
    else { this.mode = 'scene'; ({ group, triangles } = await this.scene()); }
    if (epoch !== this.epoch || !this.active()) return;
    this.stage.show(group, { selectable: this.mode === 'scene', grid: true });
    if (!fit) { this.stage.camera.position.copy(camera); this.stage.orbit.target.copy(target); this.stage.orbit.update(); }
    $('#plant-view-preview').classList.toggle('active', this.mode === 'preview'); $('#plant-view-scene').classList.toggle('active', this.mode === 'scene');
    $('#plant-scene-stats').textContent = (this.mode === 'preview' ? '单株预览' : this.project.instances.length + ' 株') + ' · ' + triangles.toLocaleString() + ' 三角面';
    this.list(); this.select(this.selected); this.prune();
  }
  prune() {
    const used = new Set(this.project.instances.map(i => JSON.stringify(i.recipe))); if (this.preview) used.add(JSON.stringify(this.preview.recipe));
    for (const [key, pending] of this.models) if (!used.has(key)) { this.models.delete(key); pending.then(disposePlant).catch(() => {}); }
  }
  async add(count, radius = 0) {
    if (this.busy) return;
    if (!this.preview || JSON.stringify(this.readControls()) !== JSON.stringify(this.preview.recipe)) await this.generate();
    if (!this.preview) throw Error('请先生成一株植物');
    if (!Number.isInteger(count) || count < 1 || count > 30 || !Number.isFinite(radius) || radius < 0 || radius > 30) throw Error('数量须为 1–30，范围须为 0–30 米');
    if (this.project.instances.length + count > MAX_PLANTS) throw Error('当前工程最多 ' + MAX_PLANTS + ' 株');
    const pendingProject=this.project,pendingEpoch=this.epoch;
    const existing = await this.scene();
    if(!this.active()||this.project!==pendingProject||this.epoch!==pendingEpoch)throw Error('植被页面或工程已切换，本次添加已停止');
    if (existing.triangles + this.preview.triangles * count > 2400000) throw Error('这次搭配模型较多，请减少株数或枝叶疏密。');
    const rng = createRng(this.config.seed + this.project.instances.length * 9173), center = this.project.instances.find(i => i.id === this.selected)?.position || [0, 0, 0];
    this.remember();
    for (let index = 0; index < count; index++) {
      const angle = rng() * Math.PI * 2, distance = count > 1 ? Math.sqrt(rng()) * radius : 0, scale = count > 1 ? .8 + rng() * .4 : 1;
      const instance = { id: crypto.randomUUID(), name: SPECIES[this.config.species].name + ' ' + (this.project.instances.length + 1), recipe: { ...this.config }, position: [center[0] + Math.cos(angle) * distance, center[1], center[2] + Math.sin(angle) * distance], rotation: [0, rng() * Math.PI * 2, 0], scale: [scale, scale, scale], locked: false };
      this.project.instances.push(instance); this.selected = instance.id;
    }
    this.mark(); this.mode = 'scene'; await this.rebuild(true); this.notify('已加入 ' + count + ' 株 ' + SPECIES[this.config.species].name);
  }
  list() {
    $('#plant-object-count').textContent = this.project.instances.length;
    $('#plant-objects').innerHTML = this.project.instances.length ? this.project.instances.map(i => `<button class="object-row ${i.id === this.selected ? 'active' : ''}" data-plant-object="${i.id}"><span>${esc(i.name)}</span><span>${i.locked ? '锁定' : SPECIES[i.recipe.species].category}</span></button>`).join('') : '<p>生成植物后，点击「加入搭配」。</p>';
    document.querySelectorAll('[data-plant-object]').forEach(button => button.onclick = () => this.safe(async () => { this.mode = 'scene'; this.selected = button.dataset.plantObject; await this.rebuild(); }));
  }
  select(id) {
    this.selected = id;
    if (!this.active() || !$('#plant-properties')) return;
    const instance = this.project.instances.find(i => i.id === id);
    this.stage.select(this.mode === 'scene' ? id : null, instance?.locked);
    document.querySelectorAll('[data-plant-object]').forEach(button => button.classList.toggle('active', button.dataset.plantObject === id));
    if (!instance) { $('#plant-properties').innerHTML = '<p>点击场景中的植物或对象列表进行编辑。</p>'; return; }
    const disabled = instance.locked ? 'disabled' : '';
    $('#plant-properties').innerHTML = `<label class="field"><span>名称</span><input id="plant-instance-name" value="${esc(instance.name)}" maxlength="120"></label><label class="field"><span>位置 X / Y / Z（m）</span><div class="triple">${instance.position.map(n => `<input data-plant-pos type="number" step=".05" value="${n.toFixed(3)}" ${disabled}>`).join('')}</div></label><label class="field"><span>朝向（°）</span><input id="plant-instance-angle" type="number" step="5" value="${(instance.rotation[1] * 180 / Math.PI).toFixed(1)}" ${disabled}></label><label class="field"><span>大小倍率</span><input id="plant-instance-scale" type="number" min=".05" max="100" step=".05" value="${instance.scale[0]}" ${disabled}></label><button id="plant-apply-transform" class="primary full-width" ${disabled}>应用变换</button><label class="checkbox"><input id="plant-lock" type="checkbox" ${instance.locked ? 'checked' : ''}>锁定</label><div class="panel-buttons"><button id="plant-copy">复制</button><button id="plant-delete" class="danger" ${disabled}>删除</button></div><button id="plant-edit-recipe" class="full-width">用这株的参数生成变体</button>`;
    $('#plant-apply-transform').onclick = () => this.safe(async () => {
      if (instance.locked) throw Error('请先解除锁定');
      const position = [...document.querySelectorAll('[data-plant-pos]')].map(e => Number(e.value)), angle = Number($('#plant-instance-angle').value) * Math.PI / 180, scale = Number($('#plant-instance-scale').value);
      const next = { ...instance, name: $('#plant-instance-name').value, position, rotation: [instance.rotation[0], angle, instance.rotation[2]], scale: [scale, scale, scale] }; validateInstances([next]);
      this.remember(); Object.assign(instance, next); this.mark(); await this.rebuild();
    });
    $('#plant-lock').onchange = event => { this.remember(); instance.locked = event.target.checked; this.mark(); this.select(id); };
    $('#plant-copy').onclick = () => this.safe(async () => { if (this.project.instances.length >= MAX_PLANTS) throw Error('工程已达到株数上限'); const total = await this.scene(); const plant = await this.model(instance.recipe); if (total.triangles + plant.triangles > 2400000) throw Error('模型较多，请减少株数或疏密。'); this.remember(); const copy = structuredClone(instance); copy.id = crypto.randomUUID(); copy.name += ' · 副本'; copy.position[0] += .6; copy.locked = false; this.project.instances.push(copy); this.selected = copy.id; this.mark(); await this.rebuild(); });
    $('#plant-delete').onclick = () => this.safe(async () => { if (instance.locked) throw Error('请先解除锁定'); this.remember(); this.project.instances = this.project.instances.filter(i => i.id !== id); this.selected = null; this.mark(); await this.rebuild(); });
    $('#plant-edit-recipe').onclick = () => this.safe(async () => { this.config = { ...instance.recipe }; this.updateControls(); await this.generate(); });
  }
  commitTransform(id, transform) {
    const instance = this.project?.instances.find(i => i.id === id); if (!instance || instance.locked || this.mode !== 'scene') return;
    validateInstances([{ ...instance, ...transform }]); this.remember(); Object.assign(instance, transform); this.mark();
    const root = this.stage.content.children.find(o => o.userData.instanceId === id); if (root) root.userData.basePosition = instance.position.slice(); this.select(id);
  }
  async undo(redo = false) { const from = redo ? this.future : this.history, to = redo ? this.history : this.future; if (!from.length) return; to.push(structuredClone(this.project.instances)); this.project.instances = from.pop(); this.mark(); this.mode = 'scene'; await this.rebuild(); }
  async create(fork = false) {
    const name = prompt(fork ? '植被副本名称' : '植被工程名称', fork ? this.project.name + ' · 副本' : '新的植被搭配'); if (name === null) return;
    try { await this.save(); } catch (error) { if (!fork || error.status !== 409) throw error; }
    const instances = fork ? structuredClone(this.project.instances) : [];
    const next = await this.api('/api/modules/vegetation/projects', send('POST', { name }));
    clearTimeout(this.timer);
    this.project = next; this.dirty = this.saved = 0; this.history = []; this.future = []; this.selected = null;
    localStorage.setItem('orbigen-vegetation-last', next.id);
    if (fork) { next.instances = instances; this.mark(); await this.save(); }
    this.projects = await this.api('/api/modules/vegetation/projects'); this.render(); this.mode = 'scene'; await this.rebuild(true);
  }
  async open(id) { await this.save(); this.project = await this.api('/api/modules/vegetation/projects/' + id); this.dirty = this.saved = 0; this.history = []; this.future = []; this.selected = null; localStorage.setItem('orbigen-vegetation-last', id); await this.restoreDraft(); this.render(); this.mode = 'scene'; await this.rebuild(true); }
  async exportScene() { if (!this.project.instances.length) throw Error('请先加入植物'); const { group } = await this.scene(); const bytes = await exportGLB(group); this.download(bytes, this.project.name + '.glb'); this.notify('植被场景已导出，包含模型、材质和贴图'); }
  async exportPackage() { await this.save(); const bytes = JSON.stringify({ format: 'OrbigenVegetationProject', version: 1, project: this.project }, null, 2); this.download(bytes, this.project.name + '.plantkit', 'application/json'); this.notify('植被工程包已导出，可重新导入继续编辑'); }
  async importPackage(file) {
    if (file.size > 2 * 1048576) throw Error('植被工程包过大');
    const data = JSON.parse(await file.text()); if (data.format !== 'OrbigenVegetationProject' || data.version !== 1 || data.project?.module !== 'vegetation') throw Error('请选择植被工程包');
    validateInstances(data.project.instances); const cost=await this.scene(data.project.instances); if(cost.triangles>2400000)throw Error('这个搭配模型较多，请先在原工程减少株数或疏密。'); await this.save();
    this.project = await this.api('/api/modules/vegetation/projects', send('POST', { name: String(data.project.name || '植被搭配') + ' · 导入' }));
    this.dirty = this.saved = 0; this.history = []; this.future = [];
    this.project.instances = data.project.instances.map(i => ({ ...i, id: crypto.randomUUID() })); this.selected = null; this.mark(); await this.save();
    localStorage.setItem('orbigen-vegetation-last', this.project.id); this.projects = await this.api('/api/modules/vegetation/projects'); this.render(); this.mode = 'scene'; await this.rebuild(true);
  }
  suspend() { this.epoch++; }
}
