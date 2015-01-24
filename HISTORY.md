# 0.3.0 (2015-01-23)

- add `info` option for tree to get info for each resource
- add `bulk` function for breaking up a lot of requests
- add `walk` function to make it easier to walk over the result of `tree`
- breaking change: make a large change to tree layout. tree is now an object, and includes the root. The root is also visited.
- breaking change: rename visit function in `tree` options to `visit`

# 0.2.0 (2014-12-31)

- add tests that will run either against mock 1P server or 1P itself
- add `port` option 
