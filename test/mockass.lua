local function ms(t) local h, m, s = t:match("(%d+):(%d+):([%d.]+)"); return math.floor(((h * 60 + m) * 60 + s) * 1000 + 0.5) end
local function parse(file)
  local subs = {}
  for ln in io.lines(file) do
    local k, v = ln:match("^(%w+): (.*)$")
    if k == "Dialogue" or k == "Comment" then
      local f = {}; local rest = v
      for _ = 1, 9 do local a, b = rest:match("^([^,]*),(.*)$"); f[#f + 1] = a; rest = b end
      subs[#subs + 1] = { class = "dialogue", comment = k == "Comment", layer = tonumber(f[1]), start_time = ms(f[2]), end_time = ms(f[3]),
        style = f[4], actor = f[5], effect = f[9], text = rest }
    elseif k and v and not ln:match("^Style:") and not ln:match("^Format:") then subs[#subs + 1] = { class = "info", key = k, value = v } end
  end
  return subs
end
return parse
