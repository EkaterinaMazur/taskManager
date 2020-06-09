import express from 'express'
import path from 'path'
import cors from 'cors'
import bodyParser from 'body-parser'
import sockjs from 'sockjs'
import { renderToStaticNodeStream } from 'react-dom/server'
import React from 'react'

import cookieParser from 'cookie-parser'
import config from './config'

import Html from '../client/html'

const { readFile, writeFile } = require('fs').promises

const shortid = require('shortid')

// console.log(shortid.generate())

const Root = () => ''

try {
  // eslint-disable-next-line import/no-unresolved
  // ;(async () => {
  //   const items = await import('../dist/assets/js/root.bundle')
  //   console.log(JSON.stringify(items))

  //   Root = (props) => <items.Root {...props} />
  //   console.log(JSON.stringify(items.Root))
  // })()
  console.log(Root)
} catch (ex) {
  console.log(' run yarn build:prod to enable ssr')
}

let connections = []

const port = process.env.PORT || 8090
const server = express()

const middleware = [
  cors(),
  express.static(path.resolve(__dirname, '../dist/assets')),
  bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }),
  bodyParser.json({ limit: '50mb', extended: true }),
  cookieParser()
]

middleware.forEach((it) => server.use(it))

const saveFile = async (task, category) => {
  return writeFile(`${__dirname}/tasks/${category}.json`, JSON.stringify(task), {
    encoding: 'utf8'
  })
}

const getFile = async (category) => {
  return readFile(`${__dirname}/tasks/${category}.json`, { encoding: 'utf8' })
    .then((data) => JSON.parse(data))
    .catch(() => [])
}

server.get('/api/v1/tasks/:category', async (req, res) => {
  const { category } = req.params
  const arr = await getFile(category)
  const result = arr
    .filter(
      (it) =>
        //  eslint-disable-next-line no-underscore-dangle
        it._isDeleted !== true
    )
    .map((it) => {
      return {
        taskId: it.taskId,
        title: it.title,
        status: it.status
      }
    })
  res.json(result)
})

server.get('/api/v1/tasks/:category/:timespan', async (req, res) => {
  const { category, timespan } = req.params
  const arr = await getFile(category)
  let periodOfTime = 0
  if (timespan === 'day') {
    periodOfTime = 86400000
  }
  if (timespan === 'week') {
    periodOfTime = 7 * 1000 * 60 * 60 * 24
  }
  if (timespan === 'month') {
    periodOfTime = 30 * 1000 * 60 * 60 * 24
  }
  const result = arr
    .filter(
      (it) =>
        //  eslint-disable-next-line no-underscore-dangle
        it._isDeleted !== true && it._createdAt + periodOfTime > +new Date()
    )
    .map((it) => {
      return {
        taskId: it.taskId,
        title: it.title,
        status: it.status
      }
    })
  res.json(result)
})

server.post('/api/v1/tasks/:category', async (req, res) => {
  const { category } = req.params
  const tasks = await getFile(category)
  const newTask = {
    taskId: shortid.generate(),
    title: req.body.title,
    status: 'new',
    _isDeleted: false,
    _createdAt: +new Date(),
    _deletedAt: null
  }
  const updatedFile = [...tasks, newTask]
  await saveFile(updatedFile, category)
  res.json({ status: 'success', newTask })
})

server.patch('/api/v1/tasks/:category/:id', async (req, res) => {
  const listOfStatuses = ['done', 'new', 'in progress', 'blocked']
  const { category, id } = req.params
  const updatedStatus = req.body.status
  const tasks = await getFile(category)

  const result = tasks.map((it) => {
  if (it.taskId === id) {
    const newTask = { ...it, status: updatedStatus }
    return newTask
  }
  return it
})
  await saveFile(result, category)
  res.json({ status: 'success' })

  if (listOfStatuses.indexOf(updatedStatus) === -1) {
    res.status(501)
    res.json({ status: 'error', message: 'incorrect status' })
  }
})

server.delete('/api/v1/tasks/:category/:id', async (req, res) => {
  const { category, id } = req.params
  const tasks = await getFile(category)
  const result = tasks.map((it) => {
    if (it.taskId === id) {
      const newTask = { ...it, _isDeleted: true }
      return newTask
    }
    return it
  })
  await saveFile(result, category)
  res.json({ status: 'success' })
})

server.use('/api/', (req, res) => {
  res.status(404)
  res.end()
})

const [htmlStart, htmlEnd] = Html({
  body: 'separator',
  title: 'Skillcrucial - Become an IT HERO'
}).split('separator')

server.get('/', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

server.get('/*', (req, res) => {
  const initialState = {
    location: req.url
  }

  return res.send(
    Html({
      body: '',
      initialState
    })
  )
})

const app = server.listen(port)

if (config.isSocketsEnabled) {
  const echo = sockjs.createServer()
  echo.on('connection', (conn) => {
    connections.push(conn)
    conn.on('data', async () => {})

    conn.on('close', () => {
      connections = connections.filter((c) => c.readyState !== 3)
    })
  })
  echo.installHandlers(app, { prefix: '/ws' })
}
console.log(`Serving at http://localhost:${port}`)
