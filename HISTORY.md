# 0.4.1 (2015-09-03)

- add strictSSL option

# 0.3.6 (2015-02-11)

- point to new repo location

# 0.3.5 (2015-02-11)

- update onep-mock to reduce dependencies

# 0.3.4 (2015-02-10)

- pass parent RID to walk() visit function

# 0.3.3 (2015-01-27)

- make walk() iterative and breadth-first

# 0.3.2 (2015-01-25)

- tree speed improvements: don't call listing unnecessarily when depth is 
  reached and call info for clients with listing request
- add createFromSpec for more compact test setup

# 0.3.1 (2015-01-24)

- breaking change: make walk() synchronous

# 0.3.0 (2015-01-23)

- add `info` option for tree to get info for each resource
- add `bulk` function for breaking up a lot of requests
- add `walk` function to make it easier to walk over the result of `tree`
- breaking change: make a large change to tree layout. tree is now an object, and includes the root. The root is also visited.
- breaking change: rename visit function in `tree` options to `visit`

# 0.2.0 (2014-12-31)

- add tests that will run either against mock 1P server or 1P itself
- add `port` option 
