# Upload Convoke to GitHub

This folder is the repository root. Upload its contents, including hidden `.gitignore`, `.npmrc`, `.openai/`, and the example configuration files. Do not put everything inside another `app` folder: the `app/` here already contains application routes.

For a new empty GitHub repository, open a terminal in this folder and run:

```sh
git init
git add .
git commit -m "Release Convoke"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Replace the example repository URL with your own. If your repository already has commits, clone it first and copy these files into that checkout, then review and commit the changes; do not force-push over existing history.

API keys, local databases, installed dependencies, build outputs, and old Git history are intentionally excluded. Run `npm ci` to install dependencies. Follow `HOSTING.md` to configure a deployment. Uploading to GitHub does not itself deploy the site, and GitHub Pages cannot run this server-backed app. Your existing Cloudflare site and its server secrets are unaffected by this upload.
