-- Magic Cake: export a YouTube-ready MP4 with the subtitles burned in.
-- Runs `magic-cake burn` on the SAVED .ass file. Needs magic-cake plus an
-- ffmpeg with libass (on macOS: brew install ffmpeg-full).
script_name = "Magic Cake: Export YouTube video"
script_description = "Burn the saved subtitles into the background video and add the audio (magic-cake burn)"
script_author = "Cass D"
script_version = "1.0"

local M = {}
local TAG = "magic-cake"
local function shq(s) return "'" .. tostring(s):gsub("'", "'\\''") .. "'" end
M.shq = shq

function M.load_saved(subs)
  local opt, idx = {}, {}
  for i = 1, #subs do
    local l = subs[i]
    if l.class == "dialogue" and l.comment and l.effect == TAG then
      local k, v = l.text:match("^opt:(export%-[^=]*)=(.*)$")
      if k then opt[k] = v; idx[#idx + 1] = i end
    end
  end
  return opt, idx
end

-- Build the shell command (exposed for tests).
function M.command(r, script)
  local cmd = r.cmd .. " burn " .. shq(script) .. " " .. shq(r.out)
  if r.video ~= "" then cmd = cmd .. " --video " .. shq(r.video) end
  if r.audio ~= "" then cmd = cmd .. " --audio " .. shq(r.audio) end
  if r.crf ~= "" then cmd = cmd .. " --crf " .. shq(r.crf) end
  if r.extra ~= "" then cmd = cmd .. " " .. r.extra end
  return cmd
end

function M.macro(subs)
  local PATH = "PATH=/opt/homebrew/bin:/usr/local/bin:$PATH "
  local fname = aegisub.file_name()
  if not fname or fname == "" or fname:match("^Untitled") then
    aegisub.debug.out("Save the script first; the export uses the .ass file on disk.\n"); return
  end
  local dir = aegisub.decode_path("?script")
  local script = dir .. "/" .. fname
  local opt, idx = M.load_saved(subs)
  local pp = aegisub.project_properties and aegisub.project_properties() or {}
  local function pick(v) return (v and v ~= "" and v:sub(1, 1) ~= "?") and v or "" end
  local cfg, y = {}, 0
  cfg[1] = { class = "label", x = 0, y = 0, width = 4,
    label = "Uses the SAVED file on disk. Save (Cmd+S) before exporting. Blank video/audio = use the .ass's own." }
  local function row(label, nm, val) y = y + 1
    cfg[#cfg + 1] = { class = "label", x = 0, y = y, label = label }
    cfg[#cfg + 1] = { class = "edit", x = 1, y = y, width = 3, name = nm, value = val } end
  row("Output video", "out", opt["export-out"] or (dir .. "/" .. fname:gsub("%.[^.]*$", "") .. "-youtube.mp4"))
  row("Background video", "video", opt["export-video"] or pick(pp.video_file))
  row("Audio", "audio", opt["export-audio"] or pick(pp.audio_file))
  row("Quality (CRF, lower = better)", "crf", opt["export-crf"] or "18")
  row("Extra options", "extra", opt["export-extra"] or "")
  row("magic-cake command", "cmd", opt["export-cmd"] or "magic-cake")
  local btn, r = aegisub.dialog.display(cfg, { "Export", "Save only", "Cancel" }, { ok = "Export", cancel = "Cancel" })
  if not btn or btn == "Cancel" then aegisub.cancel() end

  for k = #idx, 1, -1 do subs.delete(idx[k]) end
  local tmpl
  for i = 1, #subs do if subs[i].class == "dialogue" then tmpl = subs[i]; break end end
  if tmpl then
    for _, k in ipairs({ "out", "video", "audio", "crf", "extra", "cmd" }) do
      local l = {}; for kk, v in pairs(tmpl) do l[kk] = v end
      l.comment, l.effect, l.text, l.start_time, l.end_time, l.layer = true, TAG, "opt:export-" .. k .. "=" .. (r[k] or ""), 0, 0, 0
      subs.append(l)
    end
    aegisub.set_undo_point("Magic Cake export settings")
  end
  if btn == "Save only" then return end

  local cmd = PATH .. M.command(r, script)
  aegisub.progress.task("Burning subtitles (this takes a few minutes for a full song)...")
  aegisub.log("$ " .. cmd .. "\n")
  local p = io.popen(cmd .. " 2>&1; echo __EXIT:$?")
  local outp = p:read("*a"); p:close()
  local code = tonumber(outp:match("__EXIT:(%d+)")) or -1
  outp = outp:gsub("__EXIT:%d+%s*$", ""):gsub("[^\n]*\r", "")
  if code == 0 then aegisub.log(outp .. "\nDone: " .. r.out .. "\n")
  else aegisub.log(outp .. "\nExport failed (exit " .. code .. ").\n") end
end

if aegisub then aegisub.register_macro(script_name, script_description, M.macro) end
return M
