/* global it, describe, before */

// http://stackoverflow.com/questions/10120866/how-to-unit-test-with-a-file-upload-in-mocha
// http://thewayofcode.wordpress.com/2013/04/21/how-to-build-and-test-rest-api-with-nodejs-express-mocha/

var fs = require('fs')
var should = require('should')
var supertest = require('supertest')
var request = require('request')
var Norch = require('../lib/norch.js')
var sandbox = './test/sandbox/'
var norch = new Norch({indexPath: sandbox + 'norch-test'})
var superrequest = supertest('localhost:3030')

describe('Am I A Happy Norch?', function () {
  describe('General Norchiness', function () {
    it('should show the home page', function (done) {
      superrequest.get('/').expect(200).end(function (err, res) {
        should.not.exist(err)
        done()
      })
    })
  })
})

describe('Can I Index Data?', function () {
  describe('Indexing', function () {
    var timeLimit = 5000
    this.timeout(timeLimit)
    it('should post and index a file of data', function (done) {
      superrequest.post('/indexer')
        .attach('document', './node_modules/reuters-21578-json/data/justTen/justTen.json')
        .expect(200)
        .end(function (err, res) {
          should.not.exist(err)
          done()
        })
    })
    it('should post and index data "inline"', function (done) {
      superrequest.post('/indexer')
        .field('document', '[{"title":"A really interesting document","body":"This is a really interesting document"}, {"title":"Yet another really interesting document","body":"Yet again this is another really, really interesting document"}]')
        .expect(200)
        .end(function (err, res) {
          should.not.exist(err)
          done()
        })
    })
    it('should be able to search', function (done) {
      var q = {}
      q.query = {'*': ['reuter']}
      superrequest.get('/search?q=' + JSON.stringify(q))
        .expect(200)
        .end(function (err, res) {
          should.not.exist(err)
          should.exist(res.text)
          should.exist(JSON.parse(res.text).totalHits, 9)
          done()
        })
    })
  })
})

describe('Can I do indexing and restore?', function () {
  describe('Making a backup', function () {
    var timeLimit = 10000
    this.timeout(timeLimit)
    it('should generate a backup file', function (done) {
      superrequest.get('/snapshot')
        .pipe(fs.createWriteStream(sandbox + 'backup.gz'))
        .on('close', function () {
          done()
        })
    })
  })
  describe('Restoring from a backup', function () {
    var replicantNorch = new Norch({
      'indexPath': sandbox + 'norch-replicant',
      'port': 4040})
    var replicantSuperrequest = supertest('localhost:4040')
    var timeLimit = 5000
    this.timeout(timeLimit)
    // curl -X POST http://localhost:3030/replicate --data-binary @snapshot.gz -H "Content-Type: application/gzip"
    it('should post and index data "inline"', function (done) {
      replicantSuperrequest.post('/indexer')
        .field('document', '[{"title":"A really interesting document","body":"This is a really interesting document"}, {"title":"Yet another really interesting document","body":"Yet again this is another really, really interesting document"}]')
        .expect(200)
        .end(function (err, res) {
          if (err) console.log(err)
          done()
        })
    })
    it('should post and index a file of data', function (done) {
      fs.createReadStream(sandbox + 'backup.gz')
        .pipe(request.post('http://localhost:4040/replicate'))
        .on('response', function () {
          done()
        })
    })
    it('should be able to search again', function (done) {
      var q = {}
      q.query = {'*': ['reuter']}
      replicantSuperrequest.get('/search?q=' + JSON.stringify(q))
        .expect(200)
        .end(function (err, res) {
          should.not.exist(err)
          should.exist(res.text)
          should.exist(JSON.parse(res.text).totalHits, 9)
          done()
        })
    })
  })
})

describe('Can I empty an index?', function () {
  it('should say that there are documents in the index', function (done) {
    superrequest.get('/tellmeaboutmynorch').expect(200).end(function (err, res) {
      should.not.exist(err)
      should.exist(res.text)
      should.exist(JSON.parse(res.text).totalDocs, 12)
      done()
    })
  })
  it('should empty the index', function (done) {
    superrequest.get('/flush').expect(200).end(function (err, res) {
      should.not.exist(err)
      should.exist(res.text)
      should.exist(JSON.parse(res.text).success, true)
      should.exist(JSON.parse(res.text).message, 'index emptied')
      done()
    })
  })
  it('should say that there are now no documents in the index', function (done) {
    superrequest.get('/tellmeaboutmynorch').expect(200).end(function (err, res) {
      should.not.exist(err)
      should.exist(res.text)
      should.exist(JSON.parse(res.text).totalDocs, 0)
      done()
    })
  })
})

describe('Can I Index and search in bigger data files?', function () {
  var timeLimit = 120000
  this.timeout(timeLimit)

  it('should post and index a file of data with filter fields', function (done) {
    var options = {}
    options.batchName = 'reuters'
    options.fieldOptions = [
      {fieldName: 'places', filter: true},
      {fieldName: 'topics', filter: true},
      {fieldName: 'organisations', filter: true}
    ]
    superrequest.post('/indexer')
      .field('options', JSON.stringify(options))
      .attach('document', './node_modules/reuters-21578-json/data/full/reuters-000.json')
      .expect(200)
      .end(function (err, res) {
        should.not.exist(err)
        done()
      })
  })

  it('should say that there are now 1000 documents in the index', function (done) {
    superrequest.get('/tellmeaboutmynorch').expect(200).end(function (err, res) {
      should.not.exist(err)
      should.exist(res.text)
      should.exist(JSON.parse(res.text).totalDocs, 1000)
      done()
    })
  })
  it('should be able to search and show facets', function (done) {
    var q = {}
    q.query = {'*': ['reuter']}
    q.facets = {topics: {}, places: {}, organisations: {}}
    superrequest.get('/search?q=' + JSON.stringify(q)).expect(200).end(function (err, res) {
      should.not.exist(err)
      should.exist(res.text)
      var resultSet = JSON.parse(res.text)
      resultSet.should.have.property('facets')
      resultSet.totalHits.should.be.exactly(922)
      resultSet.hits.length.should.be.exactly(100)
      resultSet.facets[0].key.should.be.exactly('topics')
      resultSet.facets[0].value[0].key.should.be.exactly('earn')
      resultSet.facets[0].value[0].value.should.be.exactly(182)
      resultSet.facets[1].key.should.be.exactly('places')
      resultSet.facets[1].value[2].key.should.be.exactly('japan')
      resultSet.facets[1].value[2].value.should.be.exactly(47)
      resultSet.facets[2].key.should.be.exactly('organisations')
      resultSet.facets[2].value[4].key.should.be.exactly('worldbank')
      resultSet.facets[2].value[4].value.should.be.exactly(5)
      done()
    })
  })
  it('should be able to search, show facets, and filter', function (done) {
    var q = {}
    q['query'] = {'*': ['reuter']}
    q['facets'] = {'topics': {}, 'places': {}, 'organisations': {}}
    q['filter'] = {'topics': [['earn', 'earn']]}
    superrequest.get('/search?q=' + JSON.stringify(q)).expect(200).end(function (err, res) {
      should.not.exist(err)
      should.exist(res.text)
      var resultSet = JSON.parse(res.text)
      resultSet.hits.length.should.be.exactly(100)
      resultSet.should.have.property('facets')
      resultSet.totalHits.should.be.exactly(182)
      resultSet.facets[0].key.should.be.exactly('topics')
      resultSet.facets[0].value[0].key.should.be.exactly('earn')
      resultSet.facets[0].value[0].value.should.be.exactly(182)
      resultSet.facets[1].key.should.be.exactly('places')
      resultSet.facets[1].value[5].key.should.be.exactly('hong-kong')
      resultSet.facets[1].value[5].value.should.be.exactly(3)
      resultSet.facets[2].key.should.be.exactly('organisations')
      resultSet.facets[2].value.length.should.be.exactly(0)
      done()
    })
  })
  it('can drill down on an individual result', function (done) {
    var q = {}
    q['query'] = {'*': ['reuter']}
    q['facets'] = {'topics': {}, 'places': {}, 'organisations': {}}
    q['filter'] = {'topics': [['earn', 'earn'], ['alum', 'alum']]}
    superrequest.get('/search?q=' + JSON.stringify(q)).expect(200).end(function (err, res) {
      should.not.exist(err)
      should.exist(res.text)
      var resultSet = JSON.parse(res.text)
      resultSet.hits.length.should.be.exactly(2)
      resultSet.should.have.property('facets')
      resultSet.totalHits.should.be.exactly(2)
      resultSet.facets[0].key.should.be.exactly('topics')
      resultSet.facets[0].value.length.should.be.exactly(2)
      resultSet.facets[0].value[0].key.should.be.exactly('earn')
      resultSet.facets[0].value[0].value.should.be.exactly(2)
      resultSet.facets[0].value[1].key.should.be.exactly('alum')
      resultSet.facets[0].value[1].value.should.be.exactly(2)
      resultSet.facets[1].key.should.be.exactly('places')
      resultSet.facets[1].value.length.should.be.exactly(1)
      resultSet.facets[1].value[0].key.should.be.exactly('australia')
      resultSet.facets[1].value[0].value.should.be.exactly(2)
      done()
    })
  })
  it('should be able to do a wildcard search and return all docs in the index', function (done) {
    var q = {}
    q['query'] = {'*': ['*']}
    q['facets'] = {'topics': {}, 'places': {}, 'organisations': {}}
    superrequest.get('/search?q=' + JSON.stringify(q)).expect(200).end(function (err, res) {
      should.not.exist(err)
      should.exist(res.text)
      var resultSet = JSON.parse(res.text)
      resultSet.totalHits.should.be.exactly(1000)
      resultSet.facets[0].key.should.be.exactly('topics')
      resultSet.facets[0].value[0].key.should.be.exactly('earn')
      resultSet.facets[0].value[0].value.should.be.exactly(193)
      resultSet.facets[1].key.should.be.exactly('places')
      resultSet.facets[1].value[0].key.should.be.exactly('usa')
      resultSet.facets[1].value[0].value.should.be.exactly(546)
      done()
    })
  })
  it('should be able to match', function (done) {
    var mtch = {beginsWith: 'lon'}
    superrequest.get('/matcher?match=' + JSON.stringify(mtch)).expect(200).end(function (err, res) {
      should.exist(res.text)
      should.not.exist(err)
      var matches = JSON.parse(res.text)
      matches.should.eql([ 'long',
        'london',
        'longer',
        'longrange',
        'longstanding',
        'longtime' ]
      )
      done()
    })
  })
})

describe('Running norch and search-index in the same process.', function () {
  var norch
  var searchIndex
  var superTest
  var docId = '111'
  var docTitle = 'Test'

  before(function () {
    searchIndex = require('search-index')({indexPath: sandbox + 'norch-si-combined'})
    norch = new Norch({si: searchIndex, port: 5050})
    superTest = supertest('localhost:5050')
  })

  describe('Index status', function () {
    it('should be empty', function (done) {
      searchIndex.tellMeAboutMySearchIndex(function (err, msg) {
        should.not.exist(err)
        msg.totalDocs.should.be.exactly(0)
        done()
      })
    })
  })

  describe('indexing data through norch and si', function () {
    it('should post and index a file of data', function (done) {
      superTest.post('/indexer')
        .attach('document', './node_modules/reuters-21578-json/data/justTen/justTen.json')
        .expect(200)
        .end(function (err) {
          should.not.exist(err)
          done()
        })
    })
    it("should be possible to add a doc through search-index's api", function (done) {
      searchIndex.add([{id: docId, title: docTitle}], {batchName: 'test'}, function (err) {
        should.not.exist(err)
        done()
      })
    })
    it('should have 11 docs now', function (done) {
      searchIndex.tellMeAboutMySearchIndex(function (err, msg) {
        should.not.exist(err)
        msg.totalDocs.should.be.exactly(11)
        done()
      })
    })
  })

  describe('getting docs should work through both norch and si', function () {
    it('should be able to find doc ' + docId + ' via norch get', function (done) {
      superTest.get('/get?docID=' + docId)
        .expect(200)
        .end(function (err, res) {
          should.not.exist(err)
          var resp = JSON.parse(res.text)
          resp.id.should.be.exactly(docId)
          resp.title.should.be.exactly(docTitle)
          done()
        })
    })
    it('should be able to find doc ' + docId + ' through si get', function (done) {
      searchIndex.get(docId, function (err, res) {
        should.not.exist(err)
        var doc = res
        doc.id.should.be.exactly(docId)
        doc.title.should.be.exactly(docTitle)
        done()
      })
    })
  })
})

// needs some tests to show filtering
