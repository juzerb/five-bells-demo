'use strict'

const debug = require('debug')('five-bells-demo')
const _ = require('lodash')
const co = require('co')
const path = require('path')
if (process.env.SEED_FOR_REPEATABILITY) {
  const seedrandom = require('seedrandom')
  // replace Math.random:
  seedrandom(process.env.SEED_FOR_REPEATABILITY, { global: true })
}
const randomgraph = require('randomgraph')
const ServiceManager = require('five-bells-service-manager')

const connectorNames = [
  'mark', 'mary', 'martin', 'millie',
  'mia', 'mike', 'mesrop', 'michelle',
  'milo', 'miles', 'michael', 'micah', 'max'
]

const currencies = [
  { code: 'AUD', symbol: 'A$' },
  { code: 'BGN', symbol: 'лв' },
  { code: 'BRL', symbol: 'R$' },
  { code: 'CAD', symbol: 'C$' },
  { code: 'CHF', symbol: 'Fr.' },
  { code: 'CNY', symbol: '¥' },
  { code: 'CZK', symbol: 'Kč' },
  { code: 'DKK', symbol: 'kr.' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'HKD', symbol: 'HK$' },
  { code: 'HRK', symbol: 'kn' },
  { code: 'HUF', symbol: 'Ft' },
  { code: 'IDR', symbol: 'Rp' },
  { code: 'ILS', symbol: '₪' },
  { code: 'INR', symbol: '₹' },
  { code: 'JPY', symbol: '¥' },
  { code: 'KRW', symbol: '₩' },
  { code: 'MXN', symbol: 'Mex$' },
  { code: 'MYR', symbol: 'RM' },
  { code: 'NOK', symbol: 'kr' },
  { code: 'NZD', symbol: 'NZ$' },
  { code: 'PHP', symbol: '₱' },
  { code: 'PLN', symbol: 'zł' },
  { code: 'RON', symbol: 'lei' },
  { code: 'RUB', symbol: '₽' },
  { code: 'SEK', symbol: 'kr' },
  { code: 'SGD', symbol: 'S$' },
  { code: 'THB', symbol: '฿' },
  { code: 'TRY', symbol: '₺' },
  { code: 'USD', symbol: '$' },
  { code: 'ZAR', symbol: 'R' }
]

class Demo {
  constructor (opts) {
    const _this = this

    this.services = new ServiceManager(
      path.resolve(__dirname, '../../node_modules'),
      path.resolve(__dirname, '../../data'))
    this.adminUser = opts.adminUser
    this.adminPass = opts.adminPass

    this.integrationTestUri = opts.integrationTestUri || process.env.INTEGRATION_TEST_URI
    debug('integrationTestUri:',this.integrationTestUri)

    if (process.env.npm_node_execpath && process.env.npm_execpath) {
      this.npmPrefix = process.env.npm_node_execpath + ' ' + process.env.npm_execpath
    } else {
      this.npmPrefix = 'npm'
    }

    if (process.env.FIVE_BELLS_DEMO_GRAPH) { // explicitly defined graph available
      debug('FIVE_BELLS_DEMO_GRAPH:',process.env.FIVE_BELLS_DEMO_GRAPH)
      const graphConf = require(process.env.FIVE_BELLS_DEMO_GRAPH)
      debug('graphConf:',JSON.stringify(graphConf))
      // this.connectorNames = graphConf.edge_list_map.keys() // wtf is wrong with this?
      this.connectorNames = _.keys(graphConf.edge_list_map)
      debug('connectorNames:',this.connectorNames)
      this.numConnectors = this.connectorNames.length
      this.numLedgers = graphConf.num_ledgers
      this.ledgerHosts = {}
      this.ledgerConnectors = {}
      this.connectorEdges = new Array(this.numConnectors)
      for (let i = 0; i < this.numConnectors; i++) {
        const edges = graphConf.edge_list_map[this.connectorNames[i]]
        debug('edges:',edges)
        this.connectorEdges[i] =
          edges.map((edge) => {
            debug('edge:',edge,'source type?:',typeof edge.source)
            const source = edge.source
            const target = edge.target
            const sourceAddress = 'demo.ledger' + source + '.'
            const targetAddress = 'demo.ledger' + target + '.'
            this.ledgerHosts[sourceAddress] = 'http://localhost:' + (3000 + source)
            this.ledgerHosts[targetAddress] = 'http://localhost:' + (3000 + target)
            if (!this.ledgerConnectors[sourceAddress]) this.ledgerConnectors[sourceAddress] = []
            this.ledgerConnectors[sourceAddress].push(this.connectorNames[i])
            if (!this.ledgerConnectors[targetAddress]) this.ledgerConnectors[targetAddress] = []
            this.ledgerConnectors[targetAddress].push(this.connectorNames[i])
            return {source: sourceAddress,
                    target: targetAddress,
                    // todo? support configured or random currencies?
                    source_currency: currencies[0].code,
                    target_currency: currencies[0].code}
          })
      }
      debug('numLedgers:', this.numLedgers, ' connectorEdges:',JSON.stringify(this.connectorEdges))
    } else { // original random method

      this.numLedgers = opts.numLedgers
      this.numConnectors = opts.numConnectors
      this.barabasiAlbertConnectedCore = opts.barabasiAlbertConnectedCore || 2
      this.barabasiAlbertConnectionsPerNewNode = opts.barabasiAlbertConnectionsPerNewNode || 2

      // Connector graph
      // Barabási–Albert (N, m0, M)
      //
      // N .. number of nodes
      // m0 .. size of connected core (m0 <= N)
      // M .. (M <= m0)
      this.graph = randomgraph.BarabasiAlbert(
        this.numLedgers,
        this.barabasiAlbertConnectedCore,
        this.barabasiAlbertConnectionsPerNewNode)

      this.connectorNames = new Array(this.numConnectors)

      debug('graph:',JSON.stringify(this.graph))

      this.connectorEdges = new Array(this.numConnectors)
      for (let i = 0; i < this.numConnectors; i++) {
        this.connectorEdges[i] = []
        this.connectorNames[i] = connectorNames[i] || 'connector' + i
      }
      this.ledgerHosts = {}
      // Connector usernames per ledger
      // { ledgerPrefix → [ connectorIndex ] }
      this.ledgerConnectors = {}
      this.graph.edges.forEach(function (edge, i) {
        const source = edge.source
        const target = edge.target
        edge.source_currency = currencies[source % currencies.length].code
        edge.target_currency = currencies[target % currencies.length].code
        edge.source = 'demo.ledger' + source + '.'
        edge.target = 'demo.ledger' + target + '.'
        this.ledgerHosts[edge.source] = 'http://localhost:' + (3000 + source)
        this.ledgerHosts[edge.target] = 'http://localhost:' + (3000 + target)
        _this.connectorEdges[i % _this.numConnectors].push(edge)
        if (!this.ledgerConnectors[edge.source]) {
          this.ledgerConnectors[edge.source] = []
        }
        this.ledgerConnectors[edge.source].push(this.connectorNames[i % _this.numConnectors])
        if (!this.ledgerConnectors[edge.target]) {
          this.ledgerConnectors[edge.target] = []
        }
        this.ledgerConnectors[edge.target].push(this.connectorNames[i % _this.numConnectors])
      }, this)
    }
  }

  start () {
    return co.wrap(this._start).call(this)
  }

  * _start () {
    for (let i = 0; i < this.numLedgers; i++) {
      yield this.startLedger('demo.ledger' + i + '.', 3000 + i)
    }

    for (let i = 0; i < this.numConnectors; i++) {
      yield this.setupConnectorAccounts(this.connectorNames[i], this.connectorEdges[i])
    }
    for (let i = 0; i < this.numConnectors; i++) {
      yield this.startConnector(this.connectorNames[i], this.connectorEdges[i], i)
    }

    yield this.services.startVisualization(5000)
  }

  * startLedger (ledger, port) {
    yield this.services.startLedger(ledger, port, {
      recommendedConnectors: this.ledgerConnectors[ledger]
    })
    yield this.services.updateAccount(ledger, 'alice', {balance: '1000000000'})
    yield this.services.updateAccount(ledger, 'bob', {balance: '1000000000'})
  }

  * startConnector (connector, edges, i) {
    let integrationTestOpts = this.integrationTestUri &&
          {integrationTestUri: this.integrationTestUri,
           integrationTestName: connector,
           integrationTestPort: (4200+i)} || {}
    yield this.services.startConnector(connector, _.merge(
      {pairs: this.edgesToPairs(edges),
       credentials: this.edgesToCredentials(edges, connector),
       backend: 'fixerio'
      }, integrationTestOpts))
  }

  * setupConnectorAccounts (connector, edges) {
    debug('setupConnectorAccounts connector:',connector, 'edges:', JSON.stringify(edges))
    for (const edge of edges) {
      yield this.services.updateAccount(edge.source, connector, {balance: '1000000000', connector: edge.source + connector})
      yield this.services.updateAccount(edge.target, connector, {balance: '1000000000', connector: edge.target + connector})
    }
  }

  edgesToPairs (edges) {
    const pairs = []
    for (const edge of edges) {
      pairs.push([
        edge.source_currency + '@' + edge.source,
        edge.target_currency + '@' + edge.target
      ])
      pairs.push([
        edge.target_currency + '@' + edge.target,
        edge.source_currency + '@' + edge.source
      ])
    }
    return pairs
  }

  edgesToCredentials (edges, connectorName) {
    const creds = {}
    for (const edge of edges) {
      creds[edge.source] = this.makeCredentials(edge.source, edge.source_currency, connectorName)
      creds[edge.target] = this.makeCredentials(edge.target, edge.target_currency, connectorName)
    }
    return creds
  }

  makeCredentials (ledger, currency, name) {
    debug('makeCredentials ledger:',ledger,'account:',this.ledgerHosts[ledger] + '/accounts/' + encodeURIComponent(name))
    debug('makeCredentials ledgerHosts:',this.ledgerHosts, '[1]:', this.ledgerHosts[1])
    return {
      currency: currency,
      plugin: 'ilp-plugin-bells',
      options: {
        account: this.ledgerHosts[ledger] + '/accounts/' + encodeURIComponent(name),
        username: name,
        password: name
      }
    }
  }
}

exports.Demo = Demo
