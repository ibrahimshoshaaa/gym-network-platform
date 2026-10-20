import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {House} from 'lucide-react';
import {AdminSideNav} from '../components/admin-side-nav';
import {adminSections} from '../lib/navigation';
const ids=[...new Set(adminSections.flatMap(section=>[section.id,...section.items]))];
const items=ids.map(id=>({id,label:id,icon:House}));
test('active admin destination opens its parent and marks only the selected child',()=>{
 const html=renderToStaticMarkup(createElement(AdminSideNav,{items,current:'branch-prices',onNavigate:()=>{}}));
 assert.match(html,/aria-expanded="true" aria-controls="admin-nav-requests"/);
 assert.match(html,/<div id="admin-nav-requests" class="admin-nav-children" role="group"/);
 assert.equal((html.match(/aria-current="page"/g)??[]).length,1);
 assert.match(html,/<div id="admin-nav-finance" class="admin-nav-children" hidden=""/);
});
test('finance keeps an explicit overview and every destination stays reachable',()=>{
 const html=renderToStaticMarkup(createElement(AdminSideNav,{items,current:'finance',onNavigate:()=>{}}));
 assert.match(html,/نظرة عامة/);
 for(const section of adminSections)for(const id of section.items)assert.ok(html.includes(`>${id}</span>`),id);
 assert.equal((html.match(/aria-current="page"/g)??[]).length,1);
});
