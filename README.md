# EPUB Speed Reader

A web application for speed reading EPUB and TXT books with a focus on one word at a time, highlighting the middle letter in red.

## Features

- Load EPUB or TXT files
- Display one word at a time in the center of the screen with the middle letter highlighted in red
- Adjustable words per minute (WPM) speed
- Start/Stop controls
- Chapter selection for EPUB files
- Sidebar showing context around the current word
- Mouse wheel navigation (scroll up/down to move forward/backward)
- Spacebar to pause/resume

## Usage

1. Open the app in your browser (run `npm run dev` and visit http://localhost:5173)
2. Click "Choose File" to select an EPUB or TXT file
3. Select a chapter (for EPUB)
4. Set your desired WPM (default 300)
5. Click "Start" to begin speed reading
6. Use mouse wheel to manually navigate words
7. Press spacebar to pause/resume
8. Click "Stop" to pause

## Controls

- **Start/Stop Button**: Toggle automatic reading
- **WPM Input**: Adjust reading speed
- **Chapter Select**: Jump to different chapters (EPUB only)
- **Mouse Wheel**: Manual word navigation
- **Spacebar**: Pause/Resume

## Development

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Build for production: `npm run build`

## Dependencies

- Vite
- epubjs