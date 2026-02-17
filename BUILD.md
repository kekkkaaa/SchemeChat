## Building from Source

### Requirements

- Node.js 20+ and npm
- macOS, Windows, or Linux

### Development

1. Clone the repository:
   ```bash
   git clone https://github.com/ncvgl/polygpt.git
   cd polygpt
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm start
   ```

4. Run with DevTools (for debugging):
   ```bash
   npm run dev
   ```

### Building Distributables

Build for your current platform:

```bash
npm run build
```

Build for specific platforms:

```bash
# macOS (universal binary)
npm run build -- --mac

# Windows
npm run build -- --win

# Linux
npm run build -- --linux
```

Built files will be in the `dist/` directory.

### Releasing and Auto-Updates

This project uses `electron-updater` with GitHub Releases for over-the-air updates.

#### 1. Increment Version
Update the version in `package.json`:
```bash
# Manual version bump
"version": "0.2.x"
```

#### 2. Create and Push Tag
Tags trigger the "Build and Release" GitHub Action.
```bash
# Example for v0.2.8
git tag v0.2.8
git push origin v0.2.8
```

#### 3. Monitor GitHub Actions
The workflow will:
- Sign and Notarize for macOS
- Build binaries for Windows and Linux
- Upload all artifacts to a new GitHub Release

Users with previous versions installed will automatically download and prompt for the update on the next launch.