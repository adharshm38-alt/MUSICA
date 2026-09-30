import mongoose from 'mongoose'
import config from './env.js'

mongoose.set('strictQuery', true)

/** Connect to MongoDB with a friendly error if it isn't running. */
export async function connectDatabase() {
  try {
    const connection = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 8000,
    })
    console.log(`[db] connected to ${connection.connection.host}/${connection.connection.name}`)
    return connection
  } catch (error) {
    console.error('\n[db] Could not connect to MongoDB.\n')
    console.error(`      URI: ${config.mongoUri}\n`)
    console.error('      Is MongoDB running? Try one of:')
    console.error('        - Local install:  sudo systemctl start mongod')
    console.error('        - Docker:         docker run -d -p 27017:27017 --name musica-mongo mongo:7')
    console.error('        - MongoDB Atlas:  set MONGODB_URI in server/.env to your Atlas connection string\n')
    throw error
  }
}

export async function disconnectDatabase() {
  await mongoose.connection.close()
  console.log('[db] disconnected')
}

export default connectDatabase
