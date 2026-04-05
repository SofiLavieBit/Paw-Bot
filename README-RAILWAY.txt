Paw Bot - Railway Ready

Files included:
- index.js
- deploy-commands.js
- package.json
- .gitignore
- config.example.json
- .env.example
- railway-env-vars.txt

What changed:
- Added Railway environment variable support
- Kept local config.json fallback for running from your own PC
- Added proper npm scripts
- Added Node 20 engine for built-in fetch support

Use:
1. Copy these files into your bot folder
2. Keep your real secrets in a local config.json OR Railway variables
3. Push the project to GitHub
4. Deploy the repo on Railway
5. Set the Railway start command to: npm start
6. Run npm run deploy-commands whenever slash commands are changed

Tip:
Railway can suggest variables from .env.example files in the repo root.
