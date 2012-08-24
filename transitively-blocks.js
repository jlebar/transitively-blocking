var templates = {};

$(document).ready(function() {
  console.debug('Okay, starting.');
  Handlebars.registerHelper('showBug', function(id) {
    return 'https://bugzilla.mozilla.org/show_bug.cgi?id=' + id;
  });

  templates.bugs = Handlebars.compile($('#bugsTemplate').html());

  var bugNum = parseInt(location.search.substr(1));
  if (isNaN(bugNum)) {
    $('#error').text('Provide a bug number in the query string.');
    return;
  }

  $('#rootBugNum').text(bugNum);
  getBug(bugNum);
});

var seenBugs = {};
var retrievedBugs = {};
var allowCaching = true;

function getBug(bugNum)
{
  console.log("getBug " + bugNum);
  seenBugs[bugNum] = true;

  var include_fields = ['id', 'summary', 'assigned_to', 'depends_on', 'cf_blocking_basecamp', 'status'].join(',');

  var req = new XMLHttpRequest();
  var apiURL = 'https://api-dev.bugzilla.mozilla.org/1.1/bug/';
  var url = apiURL + bugNum + "?" + encodeReqParams({include_fields: include_fields});

  if (allowCaching) {
    var cache = localStorage.getItem(url);
    if (cache) {
      addBug(JSON.parse(cache));
      return;
    }
  }

  req.open('GET', url, /* async = */ true);
  req.setRequestHeader('Accept', 'application/json');
  req.onreadystatechange = function(e) {
    if (req.readyState == 4) {
      gotBug(url, req);
    }
  };
  req.send();
}

function encodeReqParams(dict) {
  var ret = "";
  for (k in dict) {
    ret += k + '=' + encodeURIComponent(dict[k]) + '&';
  }
  return ret;
}

function gotBug(url, req)
{
  if (req.status >= 300 || req.status < 200) {
    $('#error').text('Error ' + req.status + ' ' + req.responseText);
    return;
  }

  var bug;
  try { 
    bug = JSON.parse(req.responseText);
    localStorage.setItem(url, req.responseText);
  }
  catch(e) {
    $('#requestOutput').text('Received invalid JSON: ' + req.responseText);
    return;
  }

  addBug(bug);
}

function addBug(bug)
{
  retrievedBugs[bug.id] = bug;
  if (('depends_on' in bug) && bug.depends_on) {
    if (bug.depends_on instanceof Array) {
      bug.depends_on.forEach(function(id) {
        if (!(id in seenBugs)) {
          getBug(id);
        }
      });
    }
    else {
      getBug(bug.depends_on);
    }
  }

  showBugs(retrievedBugs);
}

function showBugs(bugs) {
  var blockers = [];
  var nonBlockers = [];

  for (var id in bugs) {
    var b = bugs[id];
    if (b.status != 'RESOLVED') {
      if (b.cf_blocking_basecamp == '+') {
        blockers.push(b);
      } else {
        nonBlockers.push(b);
      }
    }
  }

  function compareBugId(a, b) {
    if (a.id < b.id) {
      return -1;
    }
    if (b.id < a.id) {
      return 1;
    }
    return 0;
  }

  blockers.sort(compareBugId);
  nonBlockers.sort(compareBugId);

  $('#blockers').html(templates.bugs({bugs: blockers}));
  $('#nonBlockers').html(templates.bugs({bugs: nonBlockers}));
}