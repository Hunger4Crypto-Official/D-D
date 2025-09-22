FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S bot -u 1001

# Install dependencies first for better caching
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .
RUN chown -R bot:nodejs /app

# Build the application
RUN npm run build

# Create data directory with proper permissions
RUN mkdir -p ./data && chown -R bot:nodejs ./data

# Switch to non-root user
USER bot

# Expose port (only if dashboard is enabled)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); const options = { host: 'localhost', port: 3000, path: '/health', timeout: 2000 }; const req = http.get(options, (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.setTimeout(2000, () => process.exit(1));" || exit 1

# Start the application
CMD ["npm", "start"]
