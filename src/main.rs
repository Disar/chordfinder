// Hide the console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The app is a static UI (ui/) in a native WebView window; all music theory
// runs in ui/theory.js so it can be unit-tested with plain Node.

use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    thread,
    time::{Duration, SystemTime},
};

use tauri::WebviewWindow;
#[cfg(windows)]
use tauri::Manager;

/// How long a dragged MIDI file lives, so the DAW has time to read it.
const MIDI_TTL: Duration = Duration::from_secs(60);

/// Writes the MIDI file the UI built and starts a native OS drag of it, so it
/// can be dropped into a DAW (or Explorer). DAWs only accept real files, so
/// this is a short-lived temp file that Windows keeps in RAM (see
/// `write_temp_file`) and that is deleted a minute after the drop.
///
/// Sync commands run on the main thread, which the OS drag loop needs.
#[tauri::command]
fn drag_midi(window: WebviewWindow, name: String, bytes: Vec<u8>) -> Result<(), String> {
    let path = midi_dir().join(safe_file_name(&name));
    write_temp_file(&path, &bytes).map_err(|e| format!("could not write {}: {e}", path.display()))?;
    let result = start_drag(&window, path.clone()); // returns once the drop is done
    thread::spawn(move || {
        thread::sleep(MIDI_TTL);
        remove_if_stale(&path);
    });
    result
}

/// Opens the print dialog for the practice sheet. Only needed on macOS,
/// where WKWebView ignores `window.print()`; the UI calls that directly
/// elsewhere.
#[tauri::command]
fn print_page(window: WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

fn midi_dir() -> PathBuf {
    let dir = std::env::temp_dir().join("Chordfinder");
    let _ = fs::create_dir_all(&dir);
    dir
}

/// Writes a file marked FILE_ATTRIBUTE_TEMPORARY: Windows keeps it in the file
/// cache instead of writing it to the drive while there is free memory, so a
/// small file deleted soon after normally never reaches the disk.
fn write_temp_file(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_ATTRIBUTE_TEMPORARY: u32 = 0x100;
        options.attributes(FILE_ATTRIBUTE_TEMPORARY);
    }
    options.open(path)?.write_all(bytes)
}

/// Deletes the file unless it was rewritten by a newer drag since.
fn remove_if_stale(path: &Path) {
    let age = fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| SystemTime::now().duration_since(t).ok());
    if age.is_some_and(|a| a + Duration::from_secs(1) >= MIDI_TTL) {
        let _ = fs::remove_file(path);
    }
}

/// Clears files left over from a previous run (e.g. the app closed within a
/// minute of a drag).
fn clear_midi_dir() {
    if let Ok(entries) = fs::read_dir(midi_dir()) {
        for e in entries.flatten() {
            if e.path().extension().is_some_and(|x| x == "mid") {
                let _ = fs::remove_file(e.path());
            }
        }
    }
}

/// Keeps only characters that are safe in a file name on every OS.
fn safe_file_name(name: &str) -> String {
    let stem: String = name
        .trim_end_matches(".mid")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || " -_#().,'".contains(*c))
        .take(100)
        .collect();
    let stem = stem.trim();
    format!("{}.mid", if stem.is_empty() { "progression" } else { stem })
}

#[cfg(windows)]
fn start_drag(window: &WebviewWindow, path: PathBuf) -> Result<(), String> {
    const IMAGE: &[u8] = include_bytes!("../icons/drag.png");
    drag::start_drag(
        window,
        drag::DragItem::Files(vec![path]),
        drag::Image::Raw(IMAGE.to_vec()),
        |_result, _cursor| {},
        drag::Options::default(),
    )
    .map_err(|e| format!("could not start drag: {e}"))
}

#[cfg(not(windows))]
fn start_drag(_window: &WebviewWindow, _path: PathBuf) -> Result<(), String> {
    Err("dragging files out is only wired up on Windows".into())
}

fn main() {
    let result = tauri::Builder::default()
        .setup(|app| {
            thread::spawn(clear_midi_dir);
            #[cfg(windows)]
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(hwnd) = window.hwnd() {
                    titlebar::match_theme(hwnd.0);
                }
            }
            let _ = app; // used only on Windows
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![drag_midi, print_page])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("error while running Chordfinder: {e}");
        std::process::exit(1);
    }
}

/// Paints the native title bar in the UI's colours (Windows 11 and later;
/// older Windows ignores these attributes and keeps the dark theme bar).
#[cfg(windows)]
mod titlebar {
    use std::ffi::c_void;
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
    };

    // Same values as --surface, --text and --border in ui/style.css.
    const CAPTION: u32 = rgb(0x15, 0x18, 0x21);
    const TEXT: u32 = rgb(0xe8, 0xeb, 0xf2);
    const BORDER: u32 = rgb(0x2a, 0x30, 0x40);

    /// A Win32 COLORREF is 0x00BBGGRR.
    const fn rgb(r: u8, g: u8, b: u8) -> u32 {
        (r as u32) | ((g as u32) << 8) | ((b as u32) << 16)
    }

    pub fn match_theme(hwnd: *mut c_void) {
        for (attr, color) in [(DWMWA_CAPTION_COLOR, CAPTION), (DWMWA_TEXT_COLOR, TEXT), (DWMWA_BORDER_COLOR, BORDER)] {
            // SAFETY: hwnd is this app's live top-level window and the value
            // points at a 4-byte COLORREF, as DwmSetWindowAttribute expects.
            unsafe {
                DwmSetWindowAttribute(hwnd, attr as u32, &color as *const u32 as *const c_void, 4);
            }
        }
    }
}
