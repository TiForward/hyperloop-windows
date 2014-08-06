var path = require('path'),
	fs = require('fs'),
	os = require('os'),
	appc = require('node-appc'),
	crypto = require('crypto'),
	hyperloop = require('./dev').require('hyperloop-common'),
	log = hyperloop.log,
	clangparser = hyperloop.compiler.clangparser,
	programs = require('./programs'),
	buildlib = require('./buildlib'),
	finder = require('./finder');

exports.findHeader = findHeader;
exports.parseHeader = parseHeader;
exports.mixInAST = mixInAST;

/*
 Common methods to both versions of processing headers.
 */
function findHeader(options, h) {
	if (!h.match(/\.h$/)) h = h + '.h';
	var found = finder.findHeader(options.I, h, options.sdk);
	if (!found) {
		log.fatal('Failed to find header ' + h.yellow + '! Note that WinRT components should not be @imported.');
	}
	// Is it a local header?
	if (found.indexOf(options.src) >= 0) {
		// Do we have the .cpp?
		var cpp = found.substr(0, found.length - 2) + '.cpp';
		if (fs.existsSync(cpp)) {
			// Clang should parse that, instead.
			log.trace(h.bold + ' has a local ' + cpp.yellow + '; passing it to Clang, instead.');
			return cpp;
		}
	}
	return found;
}


function parseHeader(options, headerSearchPaths, header, headerPath, parsed) {
	var args = [
			'-Xclang',
			'-ast-dump',
			'-std=c++11',
			'-w',
			'-fms-compatibility',
			'-fms-extensions',
			'-fmsc-version=' + sdkToMSCVersion(options.sdk),
			'-D_MSC_FULL_VER=' + sdkToMSCVersion(options.sdk) + '40219',
			'-D__cplusplus_winrt=true',
			'-ferror-limit=0', // Disable error limiting (some results are better than no results).
			headerSearchPaths.map(pathToInclude).join(' '),
			'--analyze',
			'-fno-color-diagnostics',
			'"' + headerPath + '"'
		],
	// Generate a checksum based on the arguments; we want it to be unique.
		clangOutputChecksum = crypto.createHash('sha1').update(
			/* Args */ args.join('') +
				/* Header */ fs.readFileSync(headerPath, 'utf8')
		).digest('hex'),
		stdOut = path.join(options.dest, header + '.out.txt'),
		stdErr = path.join(options.dest, header + '.err.txt'),
		resultCache = path.join(options.dest, header + '.ast.json');
	if (fs.existsSync(resultCache) && fs.statSync(resultCache).size !== 0) {
		log.debug('Using cached parsed clang results for ' + header.yellow + '.');
		return parsed(null,JSON.parse(fs.readFileSync(resultCache, 'utf8')));
	}

	if (fs.existsSync(stdOut) && fs.statSync(stdOut).size !== 0) {
		log.debug('Using cached clang raw output for ' + header.yellow + '...');
		parseClangOutput();
	}
	else {
		log.debug('Running clang on ' + header.yellow + '...');
		programs.clang(args.join(' ') + ' >"' + stdOut + '" 2>"' + stdErr + '"', parseClangOutput);
	}

	function parseClangOutput(err) {
		if (err && err.indexOf && err.indexOf('Could not find') >= 0) {
			log.error('Could not find ' + 'clang.exe'.bold + ' on your local system!');
			log.fatal('Please download and run the "Windows installer" from ' + 'http://llvm.org/builds/'.bold);
		}
		if (!fs.existsSync(stdOut) || fs.statSync(stdOut).size === 0) {
			log.error('Clang hit an error when processing ' + header.yellow + ':');
			log.error('Error log is available at: ' + stdErr.yellow);
			log.fatal('No output produced at: ' + stdOut.yellow + '!');
		}

		log.debug('Parsing clang results for ' + header.yellow + '...');
		clangparser.parseFile(buildlib, stdOut, function(err, ast) {
			if (err) {
				log.error('Failed to parse clang results for ' + header.yellow + ':');
				log.fatal(err);
			}
			else {
				var json = ast.toJSON();
				log.debug('Finished parsing ' + header.yellow + '!');
				fs.writeFileSync(resultCache, JSON.stringify(json,null,3), 'utf8');
				parsed(null,json);
			}
		});
	}
}

function mixInAST(ast, mixed) {
	for (var key in ast) {
		if (ast.hasOwnProperty(key)) {
			if (!mixed[key]) {
				mixed[key] = ast[key];
			}
			else {
				for (var innerKey in ast[key]) {
					if (ast[key].hasOwnProperty(innerKey)) {
						if (!mixed[key][innerKey]) {
							mixed[key][innerKey] = ast[key][innerKey];
						}
					}
				}
			}
		}
	}
}

function pathToInclude(p) {
	return '-I"' + p + '"';
}

function sdkToMSCVersion(sdk) {
	switch (sdk) {
		case '8.0':
			return '1700';
		case '8.1':
			return '1800';
		default:
			log.fatal('No msc version has not been specified for ' + sdk + ' in lib/windows/hparser.js!');
	}
}