FROM mcr.microsoft.com/playwright:v1.57.0-noble@sha256:8fb7af3bb488c51364d6554876a8eddf377736608327dbdf4177b4901faf7bc9

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /opt/playwright
RUN npm install --ignore-scripts --no-audit --no-fund playwright@1.57.0
USER pwuser
CMD ["node", "node_modules/playwright/cli.js", "run-server", "--port", "3000", "--host", "0.0.0.0"]
