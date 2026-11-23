# Changelog

## [6.1.0]

### Added
- Preferences panel for extension settings
- `.env` file support in environment settings
- Runtime variables support

### Fixed
- OAuth 2.0 state param validation
- OAuth 2.0 Get Token in Cursor now returns to Cursor instead of opening VS Code
- AWS Signature v4 and NTLM auth are now applied when sending requests
- Auth inheritance across collection, folder, and request levels
- Sending a request no longer turns off certificate checks for other requests and extensions
- Long-running requests no longer fail with an IPC timeout
- Adding a client certificate through the file picker no longer crashes the extension
- Transient requests now inherit collection environments, settings, and presets, and can be saved into folders
- OpenAPI import failing in remote environments
- Drag and drop reordering is now saved in YAML collections
- Renamed requests now show up in the sidebar right away
- Environment tab now shows the selected environment, and requests refresh when a secret variable changes
- Collection presets are now saved
- JSON body comments are now stripped when sending requests
- Undo no longer causes infinite loading on POST requests
- Opening a collection with a version number in its name
- gRPC: Add Message button only shows for client-streaming methods, method search no longer closes, and multiple responses are shown
- Request-level apps only show when enabled
- Body editor now uses the full available height
- Bruno Logs panel is no longer empty after switching panels

## [6.0.0]

### Added
- Request timeline for viewing network trace, timings, and response details
- Data type support for variables (string, number, boolean, object, array)
- Apps at collection and request level
- Prompt variables to prompt the user for a value at send time

### Fixed
- Various bug fixes and stability improvements

## [5.0.2]

### Fixed
- Sidebar crash when copy-pasting requests between collections with different formats (.bru and .yml)
- Sidebar search crash on requests with numeric names
- Copy-paste and clone losing request URL and body data

## [5.0.1]

### Fixed
- Folder variables were not being saved properly
- Saved requests were not appearing in the sidebar

## [5.0.0]

### Added
- OpenCollection (`.yml`) format support
- Code Server and remote environment support
- Full OAuth2 support
- WebSocket support
- gRPC support with proto file handling
- WSL support
- Batched collection loading for improved performance

### Fixed
- All major crash issues resolved
- Runner panel stability with UI state snapshots

## [4.5.0]

### Fixed
- Crash issues on newer versions of VS Code
- Content Security Policy (CSP) compatibility fix

## [4.4.0]

### Fixed
- Minor bug fixes and improvements

## [4.3.0]

### Fixed
- Scripting environment in developer mode

## [4.2.0]

### Changed
- File Editor now shows `.bru` file by default, with an option to switch to GUI view via the Bruno icon in the top right corner

### Added
- Syntax highlighting for `.bru` files

## [4.1.0]

### Fixed
- Minor theme-related fix

## [4.0.0]

### Added
- Major revamp of the extension with full Bruno API client functionality
- Inline API testing — send requests directly from VS Code
- Collection and environment management
- Authentication support
- Pre-request and post-response scripting
- Collection runner

## [3.0.0]

### Added
- Bru File Runner

## [2.2.0]

### Changed
- Textmate grammar updates for environment vars tags

## [2.1.0]

### Changed
- Textmate grammar updates for script and vars tags

## [2.0.0]

### Changed
- Textmate grammar updates for the latest version of the bru language

## [1.2.0]

### Added
- Support for highlighting body (type=graphql-vars) block tag

## [1.1.0]

### Changed
- Textmate grammar updates to support form-urlencoded and multipart-form body types

## [1.0.2]

### Fixed
- Bug while highlighting values in headers

## [1.0.1]

### Fixed
- Screenshots and icon

## [1.0.0]

### Added
- Initial release of the Bruno extension
