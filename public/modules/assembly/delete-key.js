export function isEditingText(event){
 const path=event.composedPath?.()||[event.target];
 return path.some(target=>target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName));
}
export function handleAssemblyDeleteKey(event,{active,remove}){
 if(!active()||!['Backspace','Delete'].includes(event.key)||event.isComposing||isEditingText(event))return false;
 // In WebKit, an unhandled Backspace may navigate through page history.
 event.preventDefault();event.stopImmediatePropagation();
 if(!event.repeat&&!event.metaKey&&!event.ctrlKey&&!event.altKey)remove();
 return true;
}
