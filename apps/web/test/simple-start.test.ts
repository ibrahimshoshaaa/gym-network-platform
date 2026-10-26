import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {AdminHome} from "../components/admin-home";
test("admin daily tasks are available immediately before setup data finishes loading",()=>{
 const html=renderToStaticMarkup(createElement(AdminHome,{onNavigate:()=>{}}));
 assert.match(html,/راجع طلبات الشحن/);assert.match(html,/الجيمات والفروع/);
});
