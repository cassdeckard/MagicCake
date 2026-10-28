-- Run the export macro with a stubbed aegisub API and the real magic-cake.
-- Usage (from test/): lua run_export_mock.lua <dir containing song.ass>
local dir = arg[1]
local parse = dofile("mockass.lua")
local list = parse(dir .. "/song.ass")
local subs = setmetatable({ delete = function(i) table.remove(list, i) end, append = function(l) list[#list + 1] = l end },
  { __index = function(_, i) return list[i] end, __len = function() return #list end })
local answers = { out = dir .. "/mock-youtube.mp4", video = "", audio = "", crf = "20", extra = "--fontsdir " .. "'" .. dir:gsub("'", "'\\''") .. "/fonts'",
  cmd = "node " .. os.getenv("PWD") .. "/../magic-cake.js" }
local logs = {}
aegisub = { register_macro = function() end, decode_path = function() return dir end, file_name = function() return "song.ass" end,
  project_properties = function() return { video_file = "?dummy", audio_file = "" } end,
  dialog = { display = function(cfg) _G.CFG = cfg; return "Export", answers end }, cancel = function() error("cancel") end,
  set_undo_point = function() end, progress = { task = function() end }, log = function(s) logs[#logs + 1] = s end,
  debug = { out = function(s) logs[#logs + 1] = s end } }
local M = dofile("../automation/magic-cake-export.lua")
M.macro(subs)
local all = table.concat(logs); print(all)
assert(all:match("Done:"), "export failed")
M.macro(subs)
for _, c in ipairs(CFG) do if c.name == "crf" then assert(c.value == "20", "not prefilled") end end
local n = 0; for i = 1, #subs do if subs[i].effect == "magic-cake" then n = n + 1 end end
assert(n == 6, "expected 6 saved lines, got " .. n)
print("EXPORT MOCK TEST PASSED")
