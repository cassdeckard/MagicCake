package.path = "../automation/?.lua;" .. package.path
local parse = dofile("mockass.lua")
aegisub = nil
local M = require("magic-cake")
local subs = parse("sample.ass")
local secs = M.sections(subs)
local got = {}
for _, s in ipairs(secs) do got[#got + 1] = s.style .. "@" .. s.start .. "-" .. s.finish end
local want = "Intro@0-2200 Verse@2200-4100 Chorus@4100-5400 Verse@5400-8800"
print("sections: " .. table.concat(got, " ")); assert(table.concat(got, " ") == want, "want " .. want)
local s2 = M.sections(subs, 10000); assert(s2[#s2].finish == 10000)
assert(table.concat(M.distinct_styles(secs), ",") == "Intro,Verse,Chorus")
print(M.chain_text(secs, { Intro = "black-antoid", Verse = "270,269", Chorus = "50,300" }))
assert(M.shq("it's") == [['it'\''s']])
-- segment merging: blanks continue, same bg merges, leading blanks extend back, tiles exactly
local function segstr(secs, specs)
  local segs = M.segments(secs, specs); if not segs then return nil end
  local o, prev = {}, 0
  for _, g in ipairs(segs) do
    assert(g.start == prev, "gap/overlap at " .. g.start); prev = g.finish
    o[#o + 1] = g.spec .. "@" .. g.start .. "-" .. g.finish
  end
  assert(prev == secs[#secs].finish, "segments must end at total length")
  return table.concat(o, " ")
end
local T = { {style="Title",start=0,finish=10000}, {style="Verse",start=10000,finish=20000},
  {style="Refrain",start=20000,finish=30000}, {style="Verse",start=30000,finish=40000},
  {style="Refrain",start=40000,finish=50000}, {style="Credits",start=50000,finish=61234} }
local function eq(a, b) print(a); assert(a == b, "want " .. tostring(b)) end
eq(segstr(T, {Title="t", Verse="v", Refrain="r", Credits="c"}), "t@0-10000 v@10000-20000 r@20000-30000 v@30000-40000 r@40000-50000 c@50000-61234")
eq(segstr(T, {Title="t", Verse="v", Refrain="r"}), "t@0-10000 v@10000-20000 r@20000-30000 v@30000-40000 r@40000-61234")
eq(segstr(T, {Verse="v", Refrain="r", Credits="r"}), "v@0-20000 r@20000-30000 v@30000-40000 r@40000-61234")
eq(segstr(T, {Title="x", Verse="x", Refrain="x"}), "x@0-61234")
eq(segstr(T, {Refrain="r"}), "r@0-61234")
eq(segstr(T, {Title="t", Verse="", Refrain="t", Credits="c"}), "t@0-50000 c@50000-61234")
assert(segstr(T, {}) == nil and segstr(T, {Title="", Verse=""}) == nil)
local ct = M.chain_text(T, {Verse="v", Refrain="r"}); print(ct)
assert(select(2, ct:gsub("\n", "")) == 5 and ct:find("0.000 v   # Title + Verse", 1, true))
print("ALL LUA TESTS PASSED")
