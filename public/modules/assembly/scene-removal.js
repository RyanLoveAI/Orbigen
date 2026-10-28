// Keep only the latest removal's rendered objects for immediate undo/redo.
// These are scene instances sharing source geometry, never copied asset files.
export function captureRemovalView(stage, project) {
  const roots=stage.content.children.slice(),ids=new Set(project.instances.map(i=>i.id));
  if(roots.length!==ids.size||roots.some(o=>!ids.has(o.userData.instanceId)))return null;
  return {projectId:project.id,instances:structuredClone(project.instances),roots,selected:stage.selected};
}
export function removeRenderedInstances(stage, ids, all=false) {
  const set=new Set(ids),removed=[];
  if(all||set.has(stage.selected)) {stage.transform.detach();stage.selected=null;stage.box.visible=false;}
  for(const root of stage.content.children.slice())if(all||set.has(root.userData.instanceId)){stage.content.remove(root);removed.push(root);}
  stage.dirty=true;
  return removed;
}
export function matchingRemovalView(views, project) {
  const state=JSON.stringify(project.instances);
  return views?.find(view=>view&&view.projectId===project.id&&JSON.stringify(view.instances)===state)||null;
}
