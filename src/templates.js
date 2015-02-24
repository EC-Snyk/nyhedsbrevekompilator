'use strict';

var fs = require('fs'),
    http = require('http'),
    swig = require('swig'),
    extras = require('swig-extras'),
    bond_client = require('./bond_client'),
    checksum = require('checksum'),
    templateDir = __dirname + '/../templates';


    // templateDir = '/home/dako/Code/sii-newsletter/templates';

extras.useFilter(swig, 'split');
extras.useFilter(swig, 'trim');
extras.useFilter(swig, 'truncate');

swig.setDefaults({ cache: false }); /* must be turned of when in production*/


module.exports.register = function (plugin, options, next) {

  plugin.select('templates').views({
    engines: {
      html: swig,
      plain: swig
    },
    path: templateDir,
    isCached: false /* must be turned of when in production*/
  });

  plugin.route({
    method: 'GET',
    path: '/{template*}',
    handler: function (request, reply) {
      var templatePath = templateDir +
          (request.params.template !== undefined ? '/' + request.params.template : '');

      if (!fs.existsSync(templatePath))
        return reply().code(404);

      templatePath = fs.realpathSync(templatePath);

      fs.stat(templatePath, function (err, stat) {
        if (err) return reply().code(404);

        // Requesting a specific template
        if (stat.isFile()) {

          // Requesting a specific template with a BOND node as data input
          if (request.query.u) {

            console.log('request.query.u', request.query.u);

            download(request.query.u, function (err, data) {
              if (err) return reply(err).code(500);

              // Example of a response from a nodequeue that doesn't exist
              //   { type: 'nodequeue',
              //     id: '4222222626',
              //     loadType: 'fullNode',
              //     title: null,
              //     nodes: [] }

              if (data === null || ( data.type === 'nodequeue' && data.nodes.length === 0 )) {
                return reply().code(404);
              }

              data.subject = emailSubjectSuggestion(data);

              reply
              .view(request.params.template, data)
              .header('Transfer-Encoding', 'chunked')
              .header('Content-Type', ContentTypeHeader(request.params.template))
              .header('X-Subject-Suggestion', encodeURIComponent(data.subject))
              .header('X-Content-Checksum', calculateChecksum(data));
            });

          // } else if (request.query.node) {
          //   bond_client.getNode(request.query.node, function (err, node) {
          //     if (err) return reply(err).code(500);

          //     if (node === null) {
          //       return reply().code(404);
          //     }

          //     var node_checksum = calculateChecksum(node);

          //     node.newsl_access = calculatePaywallToken(node.id);
          //     node.subject = emailSubjectSuggestion(nodequeue);
          //     node.dates = getDates();

          //     reply
          //     .view(request.params.template, node)
          //     .header('Transfer-Encoding', 'chunked')
          //     .header('Content-Type', ContentTypeHeader(request.params.template))
          //     .header('X-Subject-Suggestion', encodeURIComponent(node.subject))
          //     .header('X-Content-Checksum', node_checksum);
          //   });

          // // Requesting a specific template with a BOND nodequeue as data input
          // } else if (request.query.nodequeue) {
          //   bond_client.getNodequeue(request.query.nodequeue, function (err, nodequeue) {
          //     if (err) return reply(err).code(500);

          //     if (nodequeue === null || nodequeue.title === null) {
          //       return reply().code(404);
          //     }

          //     var nodequeue_checksum = calculateChecksum(nodequeue);

          //     nodequeue.nodes.forEach(function (node) {
          //       node.newsl_access = calculatePaywallToken(node.id);
          //     });

          //     nodequeue.subject = emailSubjectSuggestion(nodequeue);
          //     nodequeue.dates = getDates();

          //     reply
          //     .view(request.params.template, nodequeue)
          //     .header('Transfer-Encoding', 'chunked')
          //     .header('Content-Type', ContentTypeHeader(request.params.template))
          //     .header('X-Subject-Suggestion', encodeURIComponent(nodequeue.subject))
          //     .header('X-Content-Checksum', nodequeue_checksum);
          //   });
          } else {
            reply
            .view(request.params.template)
            .header('Content-Type', ContentTypeHeader(request.params.template))
          }

        // Requesting af list of templates
        } else if (stat.isDirectory()) {
          fs.readdir(templatePath, function (err, files) {
            reply(files
              .filter(function (file) {
                return fs.statSync(templatePath + '/' + file).isFile() &&
                  (request.query.filter !== undefined ?
                    file.indexOf(request.query.filter) > -1 :
                    true);
              })
              .map(function (file) {
                return file;
              }));
          });
        } else {
          // Will this ever happen??? That the file/directory exists but is not a file nor a directory hehe!
          reply().code(404);            
        }
      });
    }
  });

  plugin.route({
    method: 'POST',
    path: '/{template*}',
    handler: function (request, reply) {

      // If the request URL ends without a filename
      if (request.params.template.charAt(request.params.template.length - 1) === '/')
        reply().code(400);

      // Creating all directories in the request URL recursive
      var dirs = request.params.template.split('/').slice(0,-1);
      dirs.forEach(function (dir, index) {
        var newDir = templateDir + '/' + dirs.slice(0, index + 1).join('/');
        if (!fs.existsSync(newDir))
          fs.mkdirSync(newDir);
      });

      fs.writeFile(templateDir + '/' + request.params.template, request.payload, function (err) {
        if (err) reply().code(500);
        else reply();
      });
    }
  });

  plugin.route({
    method: 'DELETE',
    path: '/{template*}',
    handler: function (request, reply) {

      if (request.params.template === undefined || request.params.template.charAt(request.params.template.length - 1) === '/')
        reply().code(400);

      var templatePath = fs.realpathSync(templateDir + '/' + request.params.template);

      if (fs.existsSync(templatePath)) {
        fs.unlink(templatePath, function (err) {
          if (err) reply().code(500);
          else reply();
        });
      } else {
        reply().code(404);
      }
    }
  });

  plugin.route({
    method: 'get',
    path: '/controlroom',
    handler: function (request, reply) {
      if (request.query.node) {
        var url = bond_client.getNodeControlroomUrl(request.query.node);
      } else if (request.query.nodequeue) {
        var url = bond_client.getNodequeueControlroomUrl(request.query.nodequeue);
      } else {
        return reply().code(404);
      }

      reply({url: url})
      .header('X-Controlroom-url', encodeURIComponent(url));
    }
  });

  next();
};

module.exports.register.attributes = {
    name: 'templates',
    version: '1.0.0'
};


function download (url, callback) {

  http.get(url, function( response ) {

    if (response.statusCode === 401) {
      return callback (null, null);
    } else if (response.statusCode !== 200) {
      return callback (response.statusCode, null);
    }

    var data = '';
    response.setEncoding('utf8');

    response.on('data', function ( chunk ) {
      data += chunk;
    });

    response.on('end', function() {
      callback(null, JSON.parse(data), response.headers);
    });
  }).on('error', function(e) {
    console.log('Got error while requesting HTML (' + url + '): ' + e.message);
    callback(e, null);
  });
}


function emailSubjectSuggestion (data) {
  if (data === null) return '';
  var maxLength = 255;

  if (data.type === 'nodequeue') {
    var temp = [];
    for (var i = 0; i < 3; i++) {
      temp.push(data.nodes[i].title);
    }
    return temp.join(' | ').substring(0, maxLength);
  } else {
    return data.title.substring(0, maxLength);
  }
}


function ContentTypeHeader (template) {
  if (template.slice(-5) === '.html') {
    return 'text/html; charset=utf-8';
  } else {
    return 'text/plain; charset=utf-8';
  }
}


function calculateChecksum (data) {
  if (data === null) return '';
  if (data.type === 'nodequeue') {

    var temp = data.nodes.map(function (node) {
      return node.id;
    });

    return checksum(JSON.stringify(temp));

  } else {
    return checksum(JSON.stringify(data.id));
  }
}


function calculatePaywallToken (nid) {
  var timestamp = Date.now();
  var token = checksum(nid.toString() + timestamp + process.env.PAYWALL_TOKEN_SALT, { algorithm: 'sha256' });
  var newsl_access = new Buffer(nid.toString() + '|' + timestamp + '|' + token).toString('base64');
  return newsl_access;
}

function getDates () {
  var temp = new Date();
  return {
    year: temp.getFullYear(),
    date: temp.getDate().toString(),
    yyyymmdd: temp.getFullYear() +
              ('0' + (temp.getMonth() + 1)).slice(-2) +
              ('0' + temp.getDate()).slice(-2),
    day: danishWeekdayName(temp.getDay()),
    month: danishMonthName(temp.getMonth() + 1),
    unix_timestap: temp.getTime()
  }
}

function danishWeekdayName (day) {
  switch (day) {
    case 1: return 'Mandag';
    case 2: return 'Tirsdag';
    case 3: return 'Onsdag';
    case 4: return 'Torsdag';
    case 5: return 'Fredag';
    case 6: return 'Lørdag';
    case 7: return 'Søndag';
  }
}

function danishMonthName (month) {
  switch (month) {
    case 1: return 'Januar';
    case 2: return 'Februar';
    case 3: return 'Marts';
    case 4: return 'April';
    case 5: return 'Maj';
    case 6: return 'Juni';
    case 7: return 'Juli';
    case 7: return 'August';
    case 7: return 'September';
    case 7: return 'Oktober';
    case 7: return 'November';
    case 7: return 'December';
  }
}