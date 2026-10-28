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
print("ALL LUA TESTS PASSED")
