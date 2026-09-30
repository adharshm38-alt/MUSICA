import config from './config/env.js'
import { connectDatabase, disconnectDatabase } from './config/db.js'
import { createApp } from './app.js'

async function start() {
  try {
    await connectDatabase()

    const app = createApp()
    const server = app.listen(config.port, () => {
      console.log(`\n  MUSICA API ready`)
      console.log(`  ➜  Local:    http://localhost:${config.port}/api`)
      console.log(`  ➜  Health:   http://localhost:${config.port}/api/health`)
      console.log(`  ➜  Uploads:  ${config.uploadsDir}`)
      console.log(`  ➜  Storage:  local filesystem\n`)
    })

    // Shut down cleanly on Ctrl+C so MongoDB disconnects properly.
    const shutdown = async (signal) => {
      console.log(`\n[server] ${signal} received, shutting down...`)
      server.close(async () => {
        await disconnectDatabase()
        process.exit(0)
      })
      // Don't hang forever if a connection refuses to close.
      setTimeout(() => process.exit(1), 10000).unref()
    }

    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))
  } catch (error) {
    console.error('[server] failed to start:', error.message)
    process.exit(1)
  }
}

start()
