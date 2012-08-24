var templates = {};

addEventListener('popstate', function(e) {
  getBlockers(parseInt(location.search.substr(1)));
});

$(document).ready(function() {
  $('#rootBugNum').hide();
  $('#enterBugNum').hide();
  $('#rootBugSummary').hide();

  Handlebars.registerHelper('showBug', function(id) {
    return 'https://bugzilla.mozilla.org/show_bug.cgi?id=' + id;
  });

  Handlebars.registerHelper('assignee_row', function(assigned_to) {
    if (assigned_to &&
        assigned_to.real_name &&
        assigned_to.real_name != 'Nobody; OK to take it and work on it') {
      return new Handlebars.SafeString('<tr><td></td><td><span class="assignedToHeader">assigned:</span> <span class="assignedToName">' + Handlebars.Utils.escapeExpression(assigned_to.real_name) + "</span></td>");
    }
  });

  templates.bugs = Handlebars.compile($('#bugsTemplate').html());
  templates.rootBugSummary = Handlebars.compile($('#rootBugSummaryTemplate').html());

  $('#rootBugNum').click(function() {
    $('#rootBugNum').hide();
    $('#rootBugSummary').hide();
    $('#enterBugNum').show().focus();
    $('#enterBugNum').val($('#rootBugNum').text());
  });

  $('#enterBugNum').blur(function() {
    $('#rootBugNum').show();
    $('#rootBugSummary').show();
    $('#enterBugNum').hide();
  });

  $('#enterBugNum').keypress(function(e) {
    if (e.which == 13 /* enter key */) {
      var num = parseInt($('#enterBugNum').val());
      if (!isNaN(num)) {
        history.pushState(num, '', '?' + num);
        getBlockers(num);
      }
    }
  });

  var bugNum = parseInt(location.search.substr(1));
  if (!isNaN(bugNum)) {
    getBlockers(bugNum);
  }
  else {
    $('#enterBugNum').show().focus();
  }
});

var seenBugs = {};
var retrievedBugs = {};
var allowCaching = true;

function getBlockers(bugNum)
{
  $('#blockers').text('');
  $('#nonBlockers').text('');
  $('#rootBugSummary').text('');
  seenBugs = {};
  retrievedBugs = {};

  if (!isNaN(bugNum)) {
    $('#enterBugNum').hide();
    $('#rootBugNum').text(bugNum).show();
    getBug(bugNum);
  }
  else {
    $('#rootBugNum').hide();
    $('#rootBugSummary').hide();
    $('#enterBugNum').val(bugNum).focus();
  }
}

function getBug(bugNum)
{
  seenBugs[bugNum] = true;

  var include_fields = ['id', 'summary', 'assigned_to', 'depends_on', 'cf_blocking_basecamp', 'status', 'whiteboard'].join(',');

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

  updateNetworkStatus();
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
  updateNetworkStatus();
}

function showBugs(bugs) {
  var blockers = [];
  var nonBlockers = [];

  for (var id in bugs) {
    var b = bugs[id];
    if (b.id == $('#rootBugNum').text()) {
      continue;
    }

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

  var rootBug = bugs[$('#rootBugNum').text()];
  if (rootBug) {
    $('#rootBugSummary').html(templates.rootBugSummary(rootBug));
    $('#rootBugSummary').show();
  }
}

function updateNetworkStatus()
{
  var askedFor = Object.keys(seenBugs).length;
  var received = Object.keys(retrievedBugs).length;
  if (askedFor == received) {
    $('#networkStatus').text('');
  }
  else {
    $('#networkStatus').text('Received ' + received + ' of ' + askedFor + ' bugs.');
  }
}
