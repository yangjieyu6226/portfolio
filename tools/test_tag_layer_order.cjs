const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const css = readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const html = readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

const zIndex = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(rule, `${selector} style exists`);
  const z = rule[1].match(/\bz-index:\s*(\d+)/);
  assert.ok(z, `${selector} establishes a stacking order`);
  return Number(z[1]);
};

test("blue tag stays ahead of white tag throughout the modal handoff", () => {
  assert.ok(zIndex(".tag-blue") > zIndex(".tag-white"), "home blue tag is in front");
  assert.ok(
    zIndex(".modal-id-rig") > zIndex(".modal-shared-card--white"),
    "blue modal tag's parent stacking context stays ahead of white",
  );
  assert.ok(
    zIndex(".modal-paperclip") > zIndex(".modal-id-rig"),
    "paperclip remains over the returning tags",
  );
  assert.match(
    html,
    /class="modal-id-rig"[^>]*>[\s\S]*?class="modal-shared-card modal-shared-card--blue"[\s\S]*?<\/div>/,
    "blue modal tag remains inside the moving id rig",
  );
});
