-- End-to-end: run the macro with a stubbed aegisub API and the real magic-cake.
package.path = "../automation/?.lua;" .. package.path
local parse = dofile("mockass.lua")
local list = parse("sample.ass")
local subs = setmetatable({ delete = function(i) table.remove(list, i) end, append = function(l) list[#list + 1] = l end },
  { __index = function(_, i) return list[i] end, __len = function() return #list end })
local answers = { bg1 = "black-antoid", bg2 = "270,269", bg3 = "50,300", out = "/tmp/mock-bg.mp4", size = "320x180",
  fps = "30", audio = "", extra = "", cmd = "node " .. os.getenv("PWD") .. "/../magic-cake.js" }
local logs = {}
aegisub = { register_macro = function() end, decode_path = function(p) return p == "?temp/" and "/tmp" or "/tmp/x" end,
  file_name = function() return "sample.ass" end, project_properties = function() return {} end,
  dialog = { display = function(cfg) _G.CFG = cfg; return "Render", answers end }, cancel = function() error("cancel") end,
  set_undo_point = function() end, progress = { task = function() end }, log = function(s) logs[#logs + 1] = s end,
  debug = { out = function(s) logs[#logs + 1] = s end } }
local M = dofile("../automation/magic-cake.lua")
M.macro(subs)
print(table.concat(logs))
local bg, opt = M.load_saved(subs)
assert(bg.Intro == "black-antoid" and bg.Chorus == "50,300" and opt.size == "320x180", "settings not persisted")
-- second run: dialog should be prefilled
M.macro(subs)
for _, c in ipairs(CFG) do if c.name == "bg1" then assert(c.value == "black-antoid", "not prefilled") end end
local n = 0; for i = 1, #subs do if subs[i].effect == "magic-cake" then n = n + 1 end end
assert(n == 9, "expected 9 saved lines, got " .. n)
print("MACRO MOCK TEST PASSED")
