import {randomUUID} from 'node:crypto';
import {treeRecipe,applyTreeComponent,componentFromRecipe} from './public/modules/tree/schema.js';

export class TreeComponentStore {
  constructor(db){this.db=db;db.exec('CREATE TABLE IF NOT EXISTS tree_components(id TEXT PRIMARY KEY, json TEXT NOT NULL)');}
  list(){return this.db.prepare('SELECT json FROM tree_components ORDER BY rowid DESC').all().map(x=>JSON.parse(x.json));}
  create(component,review=null){
    const recipe=applyTreeComponent(treeRecipe(),component),checked=componentFromRecipe(recipe,component.kind,component.name);
    const item={...checked,id:randomUUID(),createdAt:new Date().toISOString(),...(review?{review}: {})};
    this.db.prepare('INSERT INTO tree_components VALUES(?,?)').run(item.id,JSON.stringify(item));return item;
  }
}
