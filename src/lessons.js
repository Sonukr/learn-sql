// Practice database: a tiny online shop. Rebuilt fresh every time a lesson opens.
export const SETUP_SQL = `
CREATE TABLE customers (
  id INTEGER NOT NULL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL,
  city VARCHAR(50),
  joined_on DATE NOT NULL
);
INSERT INTO customers VALUES
 (1,'Asha Rao','asha.rao@gmail.com','Mumbai','2024-01-15'),
 (2,'Ben Carter','ben@carter.co.uk','London','2024-02-03'),
 (3,'Chen Wei','chen.wei@gmail.com','Singapore','2024-02-20'),
 (4,'Diego Lopez','diego@correo.es','Madrid','2024-03-11'),
 (5,'Emma Schmidt','emma.s@web.de','Berlin','2024-04-02'),
 (6,'Farah Khan','farah.khan@gmail.com','Mumbai','2024-05-19'),
 (7,'Gus Olsen','gus@olsen.no',NULL,'2024-06-07'),
 (8,'Hana Sato','hana@sato.jp','Tokyo','2024-06-30');

CREATE TABLE products (
  id INTEGER NOT NULL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  category VARCHAR(30) NOT NULL,
  price DECIMAL(8,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0
);
INSERT INTO products VALUES
 (1,'Mechanical Keyboard','Electronics',89.00,25),
 (2,'Wireless Mouse','Electronics',29.50,60),
 (3,'USB-C Hub','Electronics',45.00,0),
 (4,'Notebook A5','Stationery',6.00,200),
 (5,'Gel Pen Set','Stationery',12.00,150),
 (6,'Desk Lamp','Home',39.99,18),
 (7,'Coffee Mug','Home',9.50,80),
 (8,'Monitor Stand','Home',54.00,12);

CREATE TABLE orders (
  id INTEGER NOT NULL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  product_id INT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  ordered_on DATE NOT NULL
);
INSERT INTO orders VALUES
 (1,1,1,1,'2024-07-01'),(2,1,4,3,'2024-07-01'),(3,2,2,2,'2024-07-03'),
 (4,3,6,1,'2024-07-05'),(5,3,7,4,'2024-07-05'),(6,4,1,1,'2024-07-08'),
 (7,5,5,2,'2024-07-10'),(8,6,8,1,'2024-07-12'),(9,6,2,1,'2024-07-12'),
 (10,2,3,1,'2024-07-15'),(11,1,7,2,'2024-07-18'),(12,8,4,5,'2024-07-20');
-- InnoDB indexes every foreign-key column automatically
CREATE INDEX customer_id ON orders (customer_id);
CREATE INDEX product_id ON orders (product_id);
`;

// A table big enough for indexes to matter: 50,000 page views, generated deterministically
// (every user_id appears 10 times, every url 100 times, 10 countries, spread over 2024).
const PAGE_VIEWS = `
CREATE TABLE page_views (
  id INTEGER NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  url VARCHAR(100) NOT NULL,
  country CHAR(2) NOT NULL,
  viewed_at DATETIME NOT NULL,
  load_ms INT NOT NULL
);
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 50000)
INSERT INTO page_views
SELECT i, (i * 7919) % 5000 + 1, '/products/' || ((i * 104729) % 500 + 1),
  substr('INUSDEGBJPBRFRCAAUSG', ((i * 31) % 10) * 2 + 1, 2),
  datetime('2024-01-01', '+' || (i * 631 % 31536000) || ' seconds'), 50 + (i * 37) % 900
FROM n;
`;

const POOL = [
  {
    title: 'Foundations',
    lessons: [
      {
        id: 'tables', title: 'Databases, Tables & Rows', minutes: 8, level: 'Beginner',
        summary: 'Meet the practice shop database and run your very first query.',
        learn: ['What a relational database is', 'How tables, rows and columns fit together',
          'Listing tables with <code>SHOW TABLES</code>', 'Reading a table’s structure with <code>DESCRIBE</code>',
          'Your first <code>SELECT</code>'],
        steps: [
          {
            title: 'A database is an organised filing cabinet', short: 'Database',
            body: `<p>Every app has to remember things: who signed up, what is for sale, who bought what.</p>
              <p><b>MySQL</b> is a <i>relational database server</i>. It keeps that data in <b>tables</b> and answers questions you ask in <b>SQL</b> (Structured Query Language).</p>
              <p>Throughout this course you'll work with a small online shop called <code>shop</code>.</p>`,
            key: 'A database holds tables. A table holds rows. Every row in a table has the same columns.',
            viz: `<div class="model-row">
              <div class="cyl3d pop"><div class="disk"></div><div class="disk"></div><div class="disk"></div><span class="tag-float">⛁ shop</span></div>
              <div class="beam"></div>
              <div class="stack">
                <div class="block pop" style="--c:var(--s1);--d:.15s"><b>customers</b><small>who shops here · 8 rows</small></div>
                <div class="block pop" style="--c:var(--s2);--d:.3s"><b>products</b><small>what we sell · 8 rows</small></div>
                <div class="block pop" style="--c:var(--s3);--d:.45s"><b>orders</b><small>who bought what · 12 rows</small></div>
              </div></div>
              <div class="model-cap">database <b>shop</b> → 3 tables</div>`,
          },
          {
            title: 'Tables, rows and columns', short: 'Anatomy',
            body: `<p>A table looks like a spreadsheet, but with stricter rules:</p>
              <ul><li>A <b>column</b> is one kind of fact (<code>name</code>, <code>city</code>), with a fixed <b>data type</b>.</li>
              <li>A <b>row</b> is one thing: one customer, one product, one order.</li>
              <li>The <b>primary key</b> (<code>id</code> here) is unique for every row, so each row can always be found.</li></ul>`,
            key: 'You decide the columns when you design a table. Rows come and go as the app runs.',
            viz: `<div class="model-row">
              <div class="slab pop anatomy" style="--c:var(--s1)">
                <div class="slab-title">customers</div>
                <table><tr class="cols"><th>id <em>PK</em></th><th>name</th><th>city</th></tr>
                <tr><td>1</td><td>Asha Rao</td><td>Mumbai</td></tr>
                <tr class="lift"><td>2</td><td>Ben Carter</td><td>London</td></tr>
                <tr><td>3</td><td>Chen Wei</td><td>Singapore</td></tr></table>
                <span class="callout c1">← columns: the shape</span>
                <span class="callout c2">← one row = one customer</span>
                <span class="callout c3">↑ primary key: never repeats</span>
              </div></div>`,
          },
          {
            title: 'What’s in this database?', short: 'SHOW TABLES',
            sql: 'SHOW TABLES;',
            body: `<p>This query already ran. To run it again, press <b>Run</b> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>.</p>
              <p><code>SHOW TABLES</code> lists every table in the current database. The shop has three.</p>
              <p>Click a table name above the editor at any time to peek at its rows.</p>`,
          },
          {
            title: 'Look at a table’s shape', short: 'DESCRIBE',
            sql: 'DESCRIBE customers;',
            body: `<p><code>DESCRIBE</code> shows the columns of a table:</p>
              <ul><li><b>Type</b>: <code>INT</code> holds whole numbers, <code>VARCHAR(50)</code> holds text of up to 50 characters, <code>DATE</code> holds a calendar date.</li>
              <li><b>Null</b>: whether the column may be left unknown.</li>
              <li><b>Key</b>: <code>PRI</code> marks the primary key.</li>
              <li><b>Extra</b>: <code>auto_increment</code> means MySQL picks the next id for you.</li></ul>
              <p>Try <code>DESCRIBE products;</code> too.</p>`,
            key: 'Types are a contract. MySQL rejects data that doesn’t fit, and that protects you from garbage.',
          },
          {
            title: 'Your first SELECT', short: 'SELECT *',
            sql: 'SELECT * FROM customers;',
            body: `<p><code>SELECT</code> asks for data. Read it like a sentence:</p>
              <ul><li><code>SELECT *</code>: give me every column…</li><li><code>FROM customers</code>: …from the customers table.</li></ul>
              <p>The <code>;</code> ends the statement. SQL keywords are case-insensitive, but writing them in CAPS makes queries easier to read.</p>
              <p>Gus’s city is <code>NULL</code>, which means <i>unknown</i>. It is not an empty string and not zero.</p>`,
          },
          {
            title: 'Your turn: list every product', short: 'Challenge',
            sql: '-- Show every column of every row in the products table\n',
            expect: 'SELECT * FROM products;',
            body: `<p>Write a query that shows <b>all columns and all rows</b> of the <code>products</code> table, then press Run.</p>`,
          },
        ],
      },
      {
        id: 'select', title: 'SELECT: Choosing Columns', minutes: 10, level: 'Beginner',
        summary: 'Ask for exactly the columns you need, rename them, and compute new ones.',
        learn: ['Picking specific columns', 'Renaming output with <code>AS</code>', 'Arithmetic in queries',
          'Built-in functions like <code>UPPER</code> and <code>ROUND</code>', 'Removing duplicates with <code>DISTINCT</code>'],
        steps: [
          {
            title: 'Ask only for what you need', short: 'Columns',
            sql: 'SELECT name, city\nFROM customers;',
            body: `<p>Instead of <code>*</code>, list the columns you want, separated by commas. They come back in the order you list them.</p>`,
            key: 'Avoid SELECT * in real apps: it fetches data you don’t use, and your code breaks when someone adds a column.',
          },
          {
            title: 'Rename columns with AS', short: 'AS',
            sql: 'SELECT name AS customer,\n       city AS lives_in\nFROM customers;',
            body: `<p><code>AS</code> gives an output column a new name, called an <b>alias</b>. The table itself doesn't change. Only the result gets the new heading.</p>`,
          },
          {
            title: 'Calculate on the fly', short: 'Math',
            sql: 'SELECT name,\n       price,\n       ROUND(price * 1.18, 2) AS price_with_tax\nFROM products;',
            body: `<p>Columns can be expressions. Here we add 18% tax with <code>*</code>, and <code>ROUND(x, 2)</code> keeps two decimal places.</p>
              <p>Operators: <code>+</code> <code>-</code> <code>*</code> <code>/</code>. In MySQL, <code>/</code> always returns a decimal. Use <code>DIV</code> for whole-number division.</p>`,
          },
          {
            title: 'Built-in functions', short: 'Functions',
            sql: 'SELECT UPPER(name) AS shouting,\n       LOWER(email) AS email\nFROM customers;',
            body: `<p>MySQL ships with hundreds of functions for text, numbers and dates. A few you'll use constantly:</p>
              <ul><li><code>UPPER</code> / <code>LOWER</code>: change case</li><li><code>ROUND</code>: round numbers</li>
              <li><code>CONCAT(a, b)</code>: join text (MySQL)</li><li><code>NOW()</code>: the current date and time (MySQL)</li></ul>`,
          },
          {
            title: 'Remove duplicates with DISTINCT', short: 'DISTINCT',
            sql: 'SELECT DISTINCT category\nFROM products;',
            body: `<p>Eight products, but only three categories. <code>DISTINCT</code> collapses identical result rows into one.</p>
              <p>Delete <code>DISTINCT</code> and run it again to see the difference. (<code>DISTINCTROW</code> is an old MySQL synonym for DISTINCT.)</p>`,
          },
          {
            title: 'Your turn: value of the stock', short: 'Challenge',
            sql: '-- product name, and price × stock as stock_value\n',
            expect: 'SELECT name, price * stock AS stock_value FROM products;',
            body: `<p>For each product, show its <code>name</code> and a column called <code>stock_value</code> equal to <b>price × stock</b>.</p>`,
          },
        ],
      },
      {
        id: 'where', title: 'WHERE: Filtering Rows', minutes: 12, level: 'Beginner',
        summary: 'Keep only the rows that match a condition, and avoid the NULL trap.',
        learn: ['Comparison operators', 'Combining conditions with <code>AND</code> / <code>OR</code>',
          '<code>IN</code>, <code>BETWEEN</code> and <code>LIKE</code>', 'Why <code>= NULL</code> never matches'],
        steps: [
          {
            title: 'Keep only matching rows', short: 'WHERE',
            sql: "SELECT name, city\nFROM customers\nWHERE city = 'Mumbai';",
            body: `<p><code>WHERE</code> tests every row. Rows where the condition is true are kept, and the rest are dropped.</p>
              <p>Text values go in <b>single quotes</b>.</p>`,
            key: 'MySQL evaluates WHERE row by row, before it builds the result.',
          },
          {
            title: 'Compare numbers', short: 'Compare',
            sql: 'SELECT name, price\nFROM products\nWHERE price < 20;',
            body: `<p>Comparison operators: <code>=</code> <code>&lt;&gt;</code> (not equal) <code>&lt;</code> <code>&gt;</code> <code>&lt;=</code> <code>&gt;=</code>.</p>`,
          },
          {
            title: 'Combine with AND / OR', short: 'AND / OR',
            sql: "SELECT name, category, price\nFROM products\nWHERE category = 'Home'\n  AND price < 40;",
            body: `<p><code>AND</code>: both conditions must be true. <code>OR</code>: at least one must be.</p>
              <p><code>AND</code> binds tighter than <code>OR</code>, so use parentheses whenever you mix them:<br>
              <code>WHERE (a OR b) AND c</code></p>`,
          },
          {
            title: 'Match a list with IN', short: 'IN',
            sql: "SELECT name, city\nFROM customers\nWHERE city IN ('Mumbai', 'Tokyo');",
            body: `<p><code>IN (…)</code> is a shorter way to write <code>city = 'Mumbai' OR city = 'Tokyo'</code>.</p>`,
          },
          {
            title: 'Match a range with BETWEEN', short: 'BETWEEN',
            sql: 'SELECT name, price\nFROM products\nWHERE price BETWEEN 10 AND 50;',
            body: `<p><code>BETWEEN a AND b</code> is <b>inclusive</b>: it means <code>&gt;= a AND &lt;= b</code>. It works for numbers, text and dates.</p>`,
          },
          {
            title: 'Pattern matching with LIKE', short: 'LIKE',
            sql: "SELECT name, email\nFROM customers\nWHERE email LIKE '%@gmail.com';",
            body: `<p>Two wildcards:</p><ul><li><code>%</code> matches any number of characters, including none</li><li><code>_</code> matches exactly one character</li></ul>
              <p>Try <code>LIKE 'D%'</code> on <code>name</code>.</p>`,
            key: 'A pattern that starts with % can’t use an index. On big tables it scans every row.',
          },
          {
            title: 'The NULL trap', short: 'NULL',
            sql: 'SELECT name\nFROM customers\nWHERE city IS NULL;',
            body: `<p><code>NULL</code> means <i>unknown</i>. Comparing anything with unknown gives unknown, never true, so <code>city = NULL</code> matches <b>no</b> rows.</p>
              <p>Change <code>IS NULL</code> to <code>= NULL</code> and run it. Then try <code>IS NOT NULL</code>.</p>`,
            key: 'Always test for NULL with IS NULL or IS NOT NULL.',
          },
          {
            title: 'NOT flips a condition', short: 'NOT',
            sql: "SELECT name, city\nFROM customers\nWHERE city NOT IN ('Mumbai', 'London');",
            body: `<p><code>NOT</code> negates any condition: <code>NOT IN</code>, <code>NOT LIKE</code>, <code>NOT BETWEEN</code>, <code>NOT EXISTS</code>, or a whole group like <code>NOT (a OR b)</code>.</p>
              <p>Gus is missing again: his city is <code>NULL</code>, and <code>NULL NOT IN (…)</code> is <i>unknown</i>, not true. Add <code>OR city IS NULL</code> to include him.</p>
              <p>In the Editor, try <code>NOT IN ('Mumbai', NULL)</code>. It returns <b>no rows at all</b>.</p>`,
            key: 'One NULL inside a NOT IN list makes the whole condition unknown for every row.',
          },
          {
            title: 'Your turn: in-stock electronics', short: 'Challenge',
            sql: '-- all columns of Electronics products that have stock > 0\n',
            expect: "SELECT * FROM products WHERE category = 'Electronics' AND stock > 0;",
            body: `<p>Show <b>all columns</b> of products in the <code>Electronics</code> category that are <b>in stock</b> (stock greater than 0).</p>`,
          },
        ],
      },
      {
        id: 'order-limit', title: 'ORDER BY & LIMIT', minutes: 8, level: 'Beginner',
        summary: 'Sort results, take the top N, and page through rows.',
        learn: ['Sorting ascending and descending', 'Sorting by several columns', 'Top-N queries with <code>LIMIT</code>', 'Pagination with <code>OFFSET</code>'],
        steps: [
          {
            title: 'Sort with ORDER BY', short: 'ORDER BY',
            sql: 'SELECT name, price\nFROM products\nORDER BY price;',
            body: `<p>Without <code>ORDER BY</code>, the order of rows is <b>not guaranteed</b>. It can change between runs or between MySQL versions.</p>
              <p>The default direction is ascending (<code>ASC</code>), smallest first.</p>`,
            key: 'If the order matters to you, say so with ORDER BY.',
          },
          {
            title: 'Largest first with DESC', short: 'DESC',
            sql: 'SELECT name, price\nFROM products\nORDER BY price DESC;',
            body: `<p>Add <code>DESC</code> to sort from largest to smallest. For text columns, that means Z to A.</p>`,
          },
          {
            title: 'Tie-breakers', short: 'Multi-sort',
            sql: 'SELECT name, category, price\nFROM products\nORDER BY category, price DESC;',
            body: `<p>Rows are sorted by <code>category</code> first. Within the same category, they're sorted by <code>price</code> from high to low. Each column can have its own direction.</p>`,
          },
          {
            title: 'Top N with LIMIT', short: 'LIMIT',
            sql: 'SELECT name, price\nFROM products\nORDER BY price DESC\nLIMIT 3;',
            body: `<p><code>LIMIT n</code> keeps the first <i>n</i> rows of the sorted result. Together, <code>ORDER BY … DESC LIMIT 3</code> gives you the top 3.</p>
              <p>SQL Server writes this as <code>SELECT TOP 3 …</code>. MySQL has no TOP, so <code>LIMIT</code> is the way (try TOP in the Editor and you get error 1064).</p>`,
          },
          {
            title: 'Pagination with OFFSET', short: 'OFFSET',
            sql: 'SELECT name, price\nFROM products\nORDER BY price DESC\nLIMIT 3 OFFSET 3;',
            body: `<p><code>OFFSET 3</code> skips the first 3 rows, so this returns "page 2". MySQL also accepts the short form <code>LIMIT 3, 3</code>, written as offset, count.</p>`,
            key: 'A big OFFSET is slow: MySQL still reads every skipped row, then throws them away.',
          },
          {
            title: 'Your turn: newest customers', short: 'Challenge',
            sql: '-- all columns of the 2 most recently joined customers\n',
            expect: 'SELECT * FROM customers ORDER BY joined_on DESC LIMIT 2;',
            body: `<p>Show <b>all columns</b> of the <b>2 customers who joined most recently</b>.</p>`,
          },
        ],
      },
    ],
  },
  {
    title: 'Summarising & Combining',
    lessons: [
      {
        id: 'aggregates', title: 'Counting & Summing', minutes: 8, level: 'Beginner',
        summary: 'Turn many rows into one answer with aggregate functions.',
        learn: ['<code>COUNT(*)</code> vs <code>COUNT(column)</code>', '<code>SUM</code> and <code>AVG</code>', '<code>MIN</code> and <code>MAX</code>', 'Aggregating a filtered set'],
        steps: [
          {
            title: 'Count rows', short: 'COUNT(*)',
            sql: 'SELECT COUNT(*) AS customers\nFROM customers;',
            body: `<p>An <b>aggregate function</b> collapses many rows into one value. <code>COUNT(*)</code> counts rows.</p>`,
          },
          {
            title: 'COUNT(column) skips NULL', short: 'COUNT(col)',
            sql: 'SELECT COUNT(*)    AS all_rows,\n       COUNT(city) AS with_city\nFROM customers;',
            body: `<p><code>COUNT(column)</code> counts only the rows where that column is <b>not NULL</b>. Gus has no city, so he isn't counted in <code>with_city</code>.</p>`,
            key: 'Every aggregate except COUNT(*) ignores NULLs.',
          },
          {
            title: 'SUM and AVG', short: 'SUM / AVG',
            sql: 'SELECT SUM(quantity) AS items_sold,\n       AVG(quantity) AS avg_per_order\nFROM orders;',
            body: `<p><code>SUM</code> adds values up. <code>AVG</code> is the sum divided by the number of non-NULL values.</p>`,
          },
          {
            title: 'MIN and MAX', short: 'MIN / MAX',
            sql: 'SELECT MIN(price) AS cheapest,\n       MAX(price) AS priciest\nFROM products;',
            body: `<p>These also work on text (alphabetical order) and on dates (earliest and latest).</p>`,
          },
          {
            title: 'Filter, then aggregate', short: 'WHERE + agg',
            sql: 'SELECT COUNT(*) AS out_of_stock\nFROM products\nWHERE stock = 0;',
            body: `<p><code>WHERE</code> runs first and removes rows. The aggregate then works only on the rows that are left.</p>`,
          },
          {
            title: 'Your turn: total stock', short: 'Challenge',
            sql: '-- total units in stock across all products, as total_stock\n',
            expect: 'SELECT SUM(stock) AS total_stock FROM products;',
            body: `<p>How many units are in stock across <b>all</b> products? Name the column <code>total_stock</code>.</p>`,
          },
        ],
      },
      {
        id: 'group-by', title: 'GROUP BY & HAVING', minutes: 10, level: 'Intermediate',
        summary: 'Get one summary row per category, per customer, per anything.',
        learn: ['Grouping rows with <code>GROUP BY</code>', 'Several aggregates per group', 'The <code>ONLY_FULL_GROUP_BY</code> rule', 'Filtering groups with <code>HAVING</code>'],
        steps: [
          {
            title: 'One row per group', short: 'GROUP BY',
            sql: 'SELECT category, COUNT(*) AS products\nFROM products\nGROUP BY category;',
            body: `<p><code>GROUP BY category</code> puts rows into buckets, one per distinct category. The aggregate then runs <b>separately for each bucket</b>.</p>`,
            key: 'Without GROUP BY, an aggregate covers the whole table. With it, you get one answer per group.',
          },
          {
            title: 'Several aggregates at once', short: 'Multi-agg',
            sql: 'SELECT category,\n       MIN(price) AS min_price,\n       MAX(price) AS max_price,\n       ROUND(AVG(price), 2) AS avg_price\nFROM products\nGROUP BY category;',
            body: `<p>You can calculate as many aggregates per group as you like.</p>`,
          },
          {
            title: 'Group orders by customer', short: 'Per customer',
            sql: 'SELECT customer_id,\n       COUNT(*) AS orders,\n       SUM(quantity) AS items\nFROM orders\nGROUP BY customer_id;',
            body: `<p>This shows how many orders each customer placed and how many items they bought. In the JOIN lesson you'll swap <code>customer_id</code> for real names.</p>`,
          },
          {
            title: 'The golden rule of GROUP BY', short: 'The rule',
            body: `<p>Every column in <code>SELECT</code> must be either <b>listed in GROUP BY</b> or <b>wrapped in an aggregate</b>.</p>
              <p>Since MySQL 5.7, the default <code>ONLY_FULL_GROUP_BY</code> mode rejects queries that break this rule. The left query is ambiguous: a category has many product names, so which one should MySQL show?</p>
              <p><i>Note: this practice sandbox (SQLite) is more lenient than MySQL, so follow the rule anyway.</i></p>`,
            viz: `<div class="model-row">
              <div class="slab pop code bad" style="--c:var(--s4)"><div class="slab-title">✗ MySQL error 1055</div><pre>SELECT category, <u>name</u>, COUNT(*)
FROM products
GROUP BY category;</pre><small>Electronics has 3 names. Which one?</small></div>
              <div class="slab pop code good" style="--c:var(--s6);--d:.2s"><div class="slab-title">✓ Valid</div><pre>SELECT category, COUNT(*)
FROM products
GROUP BY category;</pre><small>One clear value per group.</small></div></div>`,
          },
          {
            title: 'Filter groups with HAVING', short: 'HAVING',
            sql: 'SELECT customer_id, SUM(quantity) AS items\nFROM orders\nGROUP BY customer_id\nHAVING SUM(quantity) >= 4;',
            body: `<p><code>WHERE</code> filters <b>rows</b> before grouping. <code>HAVING</code> filters <b>groups</b> after the aggregates are calculated.</p>
              <p>Execution order: <code>FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT</code></p>`,
            key: 'If a condition uses an aggregate, it belongs in HAVING. Otherwise, put it in WHERE.',
          },
          {
            title: 'Your turn: busy cities', short: 'Challenge',
            sql: '-- city and number of customers, only cities with more than 1 customer\n',
            expect: 'SELECT city, COUNT(*) AS customers FROM customers GROUP BY city HAVING COUNT(*) > 1;',
            body: `<p>For each <code>city</code>, count the customers as <code>customers</code>. Show <b>only cities with more than one customer</b>.</p>`,
          },
        ],
      },
      {
        id: 'joins', title: 'JOINs: Combining Tables', minutes: 14, level: 'Intermediate',
        summary: 'Stitch related tables back together using their keys.',
        learn: ['Why data is split across tables', '<code>INNER JOIN</code> on a foreign key', 'Joining three tables',
          '<code>LEFT JOIN</code> and finding missing matches', 'Joining and grouping together'],
        steps: [
          {
            title: 'Why data is split across tables', short: 'Keys',
            body: `<p>An order doesn't store the customer's name. It stores <code>customer_id</code>, which points to a row in <code>customers</code>.</p>
              <p>That pointer is a <b>foreign key</b>. Each fact is stored once, so a renamed customer only needs updating in one place.</p>`,
            key: 'A JOIN follows the key from one table to the other and puts the rows side by side.',
            viz: `<div class="model-row">
              <div class="slab pop" style="--c:var(--s2)"><div class="slab-title">orders</div>
                <table><tr class="cols"><th>id</th><th>customer_id <em>FK</em></th><th>qty</th></tr>
                <tr><td>3</td><td class="k">2</td><td>2</td></tr><tr><td>10</td><td class="k">2</td><td>1</td></tr></table></div>
              <div class="fk-beam"><span>customer_id → id</span></div>
              <div class="slab pop" style="--c:var(--s1);--d:.2s"><div class="slab-title">customers</div>
                <table><tr class="cols"><th>id <em>PK</em></th><th>name</th></tr>
                <tr><td>1</td><td>Asha Rao</td></tr><tr><td class="k">2</td><td>Ben Carter</td></tr><tr><td>3</td><td>Chen Wei</td></tr></table></div></div>
              <div class="model-cap">Two orders point at the <b>same</b> customer. The name is stored once.</div>`,
          },
          {
            title: 'INNER JOIN', short: 'JOIN',
            sql: 'SELECT o.id, c.name, o.quantity\nFROM orders o\nJOIN customers c ON c.id = o.customer_id;',
            body: `<p><code>JOIN … ON</code> pairs each order with the customer whose <code>id</code> matches. <code>o</code> and <code>c</code> are short <b>table aliases</b>.</p>
              <p>A plain <code>JOIN</code> is an <code>INNER JOIN</code>: it returns only the rows that have a match in both tables.</p>`,
          },
          {
            title: 'Join three tables', short: '3 tables',
            sql: 'SELECT c.name, p.name AS product, o.quantity,\n       p.price * o.quantity AS total\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nJOIN products  p ON p.id = o.product_id;',
            body: `<p>Chain one <code>JOIN</code> per table. Each <code>ON</code> clause says how the new table connects to what you already have.</p>`,
          },
          {
            title: 'LEFT JOIN keeps unmatched rows', short: 'LEFT JOIN',
            sql: 'SELECT c.name, o.id AS order_id\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id;',
            body: `<p><code>LEFT JOIN</code> keeps <b>every</b> row from the left table. Where no match exists, the right-hand columns are <code>NULL</code>.</p>
              <p>Gus hasn't ordered anything, but he still appears. Change it to <code>JOIN</code> and he disappears.</p>`,
          },
          {
            title: 'Find rows with no match', short: 'Anti-join',
            sql: 'SELECT c.name\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nWHERE o.id IS NULL;',
            body: `<p>Do a LEFT JOIN, then keep only the rows where the right side is <code>NULL</code>. This classic pattern answers questions like "which customers have never ordered?"</p>`,
          },
          {
            title: 'Join, then group', short: 'JOIN + GROUP',
            sql: 'SELECT c.name,\n       ROUND(SUM(p.price * o.quantity), 2) AS spent\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nJOIN products  p ON p.id = o.product_id\nGROUP BY c.id, c.name\nORDER BY spent DESC;',
            body: `<p>This brings together everything so far: join the tables, group per customer, sum the spend, and sort. It's a real revenue report.</p>`,
          },
          {
            title: 'Your turn: best sellers', short: 'Challenge',
            sql: '-- product name and total units ordered (as units), most first\n',
            expect: 'SELECT p.name, SUM(o.quantity) AS units FROM products p JOIN orders o ON o.product_id = p.id GROUP BY p.id, p.name ORDER BY units DESC;',
            body: `<p>For each product that has been ordered, show its <code>name</code> and the total quantity ordered as <code>units</code>, with the best sellers first.</p>`,
          },
        ],
      },
    ],
  },
  {
    title: 'Changing Data',
    lessons: [
      {
        id: 'insert', title: 'INSERT: Adding Rows', minutes: 10, level: 'Beginner',
        summary: 'Add rows, let AUTO_INCREMENT pick ids, and see constraints push back.',
        learn: ['Inserting one row and many rows', 'How <code>AUTO_INCREMENT</code> assigns ids', 'Defaults and NULL for missing columns',
          'Duplicate-key and NOT NULL errors', 'Upserts with <code>ON DUPLICATE KEY UPDATE</code>'],
        steps: [
          {
            title: 'Add one row', short: 'INSERT',
            sql: "INSERT INTO customers (name, email, city, joined_on)\nVALUES ('Ivy Nair', 'ivy@gmail.com', 'Pune', '2024-08-01');\nSELECT * FROM customers ORDER BY id DESC LIMIT 3;",
            body: `<p>Name the columns, then give the <code>VALUES</code> in the same order.</p>
              <p>We left out <code>id</code>. It's an <code>AUTO_INCREMENT</code> column, so MySQL gives the new row the next number: 9.</p>
              <p>In the <b>Editor</b> tab, writes only happen when you press Run.</p>`,
            key: 'Always list the columns in an INSERT. Then your query keeps working if the table gains a column later.',
          },
          {
            title: 'Insert several rows at once', short: 'Multi-row',
            sql: "INSERT INTO products (name, category, price, stock)\nVALUES ('Sticky Notes', 'Stationery', 3.50, 300),\n       ('Laptop Sleeve', 'Electronics', 24.00, 40);\nSELECT * FROM products WHERE id > 6;",
            body: `<p>Separate the row tuples with commas. A single multi-row INSERT is much faster than many one-row INSERTs, because there's one round trip and one commit.</p>`,
          },
          {
            title: 'Defaults fill the gaps', short: 'DEFAULT',
            sql: "INSERT INTO products (name, category, price)\nVALUES ('Plant Pot', 'Home', 15.00);\nSELECT name, price, stock FROM products WHERE id > 7;",
            body: `<p>We didn't give a <code>stock</code> value. The table defines <code>stock INT NOT NULL DEFAULT 0</code>, so MySQL fills in 0.</p>
              <p>A nullable column with no default gets <code>NULL</code> instead.</p>`,
          },
          {
            title: 'Constraints say no', short: 'Errors',
            sql: "INSERT INTO customers (id, name, email, joined_on)\nVALUES (1, 'Copy Cat', 'cc@example.com', '2024-08-02');",
            body: `<p>Id 1 already belongs to Asha. A primary key must be unique, so MySQL rejects the whole row with <b>error 1062: Duplicate entry</b>.</p>
              <p>In the Editor, also try removing <code>email</code> from the column list. That gives <b>error 1048</b>, because <code>email</code> is <code>NOT NULL</code>.</p>`,
            key: 'Constraints are guard rails. Bad data is stopped at the door, before it ever reaches your table.',
          },
          {
            title: 'Upsert: insert, or update if it exists', short: 'Upsert',
            sql: "INSERT INTO products (id, name, category, price, stock)\nVALUES (2, 'Wireless Mouse', 'Electronics', 29.50, 10)\nON DUPLICATE KEY UPDATE stock = stock + VALUES(stock);\nSELECT id, name, stock FROM products WHERE id = 2;",
            body: `<p>Product 2 already exists. Instead of failing, <code>ON DUPLICATE KEY UPDATE</code> runs the update part: stock goes from 60 to 70.</p>
              <p><code>VALUES(stock)</code> means "the value I tried to insert". MySQL 8.0.20+ prefers a row alias: <code>VALUES (…) AS new … stock = stock + new.stock</code>.</p>
              <p>Other databases call this <code>MERGE</code>. MySQL has no MERGE statement; ON DUPLICATE KEY UPDATE is its upsert.</p>`,
          },
          {
            title: 'Your turn: stock a new product', short: 'Challenge',
            sql: '-- add product: Bookends, category Home, price 18.00, stock 30\n',
            expect: "INSERT INTO products (name, category, price, stock) VALUES ('Bookends', 'Home', 18.00, 30);",
            verify: "SELECT name, category, price, stock FROM products ORDER BY id",
            body: `<p>Add a product named <code>Bookends</code> in category <code>Home</code>, priced <b>18.00</b>, with <b>30</b> in stock. Let MySQL choose the id.</p>`,
          },
        ],
      },
      {
        id: 'update-delete', title: 'UPDATE & DELETE', minutes: 12, level: 'Beginner',
        summary: 'Change and remove rows safely, without wiping the whole table by accident.',
        learn: ['Changing values with <code>UPDATE … SET</code>', 'Updating many rows with an expression', 'Why a missing WHERE is dangerous',
          'Deleting rows, and how foreign keys protect them', '<code>DELETE</code> vs <code>TRUNCATE</code> vs <code>DROP</code>'],
        steps: [
          {
            title: 'UPDATE: change a row', short: 'UPDATE',
            sql: "UPDATE customers\nSET city = 'Oslo'\nWHERE id = 7;\nSELECT * FROM customers WHERE id = 7;",
            body: `<p><code>SET</code> says what to change. <code>WHERE</code> says which rows to change. Gus finally gets a city.</p>
              <p>MySQL replies with how many rows were <b>matched</b> and how many were <b>changed</b>.</p>`,
          },
          {
            title: 'Change many rows with an expression', short: 'Expression',
            sql: "UPDATE products\nSET price = ROUND(price * 0.9, 2)\nWHERE category = 'Stationery';\nSELECT name, category, price FROM products;",
            body: `<p>The new value can be calculated from the old one. This gives a 10% Stationery sale, applied to every matching row in one statement.</p>
              <p>Run it twice in the Editor and the discount compounds. UPDATEs are not "set once" operations.</p>`,
          },
          {
            title: 'The missing WHERE', short: 'Danger',
            body: `<p>An <code>UPDATE</code> or <code>DELETE</code> with <b>no WHERE</b> touches <b>every row</b>, and there is no undo button.</p>
              <ul><li>Write the <code>SELECT</code> with your WHERE first and check the rows it returns, then change it into the UPDATE.</li>
              <li>MySQL's <code>--safe-updates</code> mode (on by default in Workbench) blocks UPDATE and DELETE without a key in the WHERE.</li>
              <li>Or wrap risky changes in a transaction (next lesson).</li></ul>`,
            viz: `<div class="model-row">
              <div class="slab pop code bad" style="--c:var(--s4)"><div class="slab-title">✗ every price is now 0</div><pre>UPDATE products
SET price = 0;</pre><small>8 rows changed. Oops.</small></div>
              <div class="slab pop code good" style="--c:var(--s6);--d:.2s"><div class="slab-title">✓ preview, then change</div><pre>SELECT * FROM products
WHERE id = 3;      -- 1 row ✓
UPDATE products
SET price = 0
WHERE id = 3;</pre><small>1 row changed.</small></div></div>`,
          },
          {
            title: 'Delete rows', short: 'DELETE',
            sql: "DELETE FROM orders\nWHERE id = 12;\nSELECT COUNT(*) AS orders_left FROM orders;",
            body: `<p><code>DELETE FROM … WHERE …</code> removes the matching rows. Without a WHERE, it removes every row in the table.</p>`,
          },
          {
            title: 'Foreign keys protect you', short: 'FK guard',
            sql: "DELETE FROM customers\nWHERE id = 1;",
            body: `<p>Asha has orders that point at her through <code>orders.customer_id</code>. Deleting her would leave those orders pointing at nobody, so InnoDB refuses with <b>error 1451</b>.</p>
              <p>Gus (id 7) has no orders. In the Editor, try deleting him instead, and it works.</p>`,
            key: 'To delete a parent row, delete its children first, or define the foreign key with ON DELETE CASCADE.',
          },
          {
            title: 'DELETE vs TRUNCATE vs DROP', short: 'Compare',
            body: `<ul><li><code>DELETE FROM t WHERE …</code> removes chosen rows. It can be rolled back, and triggers fire.</li>
              <li><code>TRUNCATE TABLE t</code> empties the table fast and resets AUTO_INCREMENT. The structure stays, and it can't be rolled back.</li>
              <li><code>DROP TABLE t</code> removes the data <b>and</b> the table itself.</li></ul>
              <p><i>TRUNCATE and DROP aren't run in this sandbox. They're shown here so you can see the difference.</i></p>`,
            viz: `<div class="model-row">
              <div class="slab pop mini" style="--c:var(--s1)"><div class="slab-title">DELETE … WHERE</div>
                <div class="minirows"><i></i><i class="x"></i><i></i><i class="x"></i><i></i></div><small>some rows gone</small></div>
              <div class="slab pop mini" style="--c:var(--s5);--d:.15s"><div class="slab-title">TRUNCATE</div>
                <div class="minirows"><i class="x"></i><i class="x"></i><i class="x"></i><i class="x"></i><i class="x"></i></div><small>empty, table remains</small></div>
              <div class="slab pop mini ghosted" style="--c:var(--s4);--d:.3s"><div class="slab-title">DROP</div>
                <div class="minirows"></div><small>table is gone</small></div></div>`,
          },
          {
            title: 'Your turn: restock', short: 'Challenge',
            sql: '-- add 50 to the stock of every product that is out of stock\n',
            expect: 'UPDATE products SET stock = stock + 50 WHERE stock = 0;',
            verify: 'SELECT id, stock FROM products',
            body: `<p>Every product with <code>stock = 0</code> just got a delivery of <b>50 units</b>. Update their stock, and leave the other products alone.</p>`,
          },
        ],
      },
      {
        id: 'transactions', title: 'Transactions', minutes: 12, level: 'Intermediate',
        summary: 'Group changes so they all happen, or none of them do.',
        learn: ['Why multi-step changes need transactions', '<code>START TRANSACTION</code>, <code>COMMIT</code>, <code>ROLLBACK</code>',
          'Autocommit and implicit commits', 'What isolation means', 'ACID in plain words'],
        steps: [
          {
            title: 'All or nothing', short: 'Why',
            body: `<p>Selling something takes two changes: <b>insert an order</b> and <b>reduce the stock</b>. If the server crashes between them, you have an order with no stock change, or stock that disappeared with no order.</p>
              <p>A <b>transaction</b> wraps both changes: either all of them become permanent (<code>COMMIT</code>) or none do (<code>ROLLBACK</code>).</p>`,
            key: 'ACID: Atomic (all or nothing), Consistent (rules hold), Isolated (others don’t see half-done work), Durable (committed means saved).',
            viz: `<div class="model-row flow">
              <div class="block pop" style="--c:var(--s5)"><b>START</b><small>TRANSACTION</small></div><span class="flow-arrow">→</span>
              <div class="block pop" style="--c:var(--s6);--d:.15s"><b>INSERT</b><small>new order</small></div><span class="flow-arrow">→</span>
              <div class="block pop" style="--c:var(--s1);--d:.3s"><b>UPDATE</b><small>stock − 2</small></div><span class="flow-arrow">→</span>
              <div class="fork">
                <div class="block pop" style="--c:var(--s2);--d:.45s"><b>COMMIT ✓</b><small>both saved</small></div>
                <div class="block pop" style="--c:var(--s4);--d:.6s"><b>ROLLBACK ↺</b><small>both undone</small></div>
              </div></div>`,
          },
          {
            title: 'Start a transaction', short: 'START',
            sql: "START TRANSACTION;\nINSERT INTO orders (customer_id, product_id, quantity, ordered_on)\nVALUES (7, 1, 2, '2024-08-05');\nUPDATE products SET stock = stock - 2 WHERE id = 1;\nSELECT id, name, stock FROM products WHERE id = 1;",
            body: `<p>After <code>START TRANSACTION</code>, your changes are <b>tentative</b> (<code>BEGIN</code> is a synonym for START TRANSACTION). You can see them, but other connections can't, and they aren't saved yet.</p>
              <p>Watch for the striped rows: they're uncommitted.</p>`,
          },
          {
            title: 'Changed your mind? ROLLBACK', short: 'ROLLBACK',
            pre: "START TRANSACTION;\nINSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (7, 1, 2, '2024-08-05');\nUPDATE products SET stock = stock - 2 WHERE id = 1;",
            sql: "ROLLBACK;\nSELECT id, name, stock FROM products WHERE id = 1;",
            body: `<p><code>ROLLBACK</code> throws away <b>everything</b> since <code>START TRANSACTION</code>. The new order disappears and the stock is back to 25, as if nothing happened.</p>`,
          },
          {
            title: 'Make it permanent: COMMIT', short: 'COMMIT',
            sql: "BEGIN;\nINSERT INTO orders (customer_id, product_id, quantity, ordered_on)\nVALUES (7, 1, 2, '2024-08-05');\nUPDATE products SET stock = stock - 2 WHERE id = 1;\nCOMMIT;",
            body: `<p>This time the transaction opens with <code>BEGIN</code>, the same as START TRANSACTION. <code>COMMIT</code> makes both changes permanent and visible to everyone, at the same moment.</p>
              <p>After a commit, there is nothing left to roll back.</p>`,
          },
          {
            title: 'Autocommit: the invisible transaction', short: 'Autocommit',
            body: `<p>By default MySQL runs with <code>autocommit = 1</code>: every statement outside START TRANSACTION is its own tiny transaction, committed immediately. That's why your changes in the INSERT lesson were permanent straight away.</p>
              <ul><li><code>SET autocommit = 0;</code> keeps a transaction open until you COMMIT.</li>
              <li>DDL such as <code>CREATE</code>, <code>ALTER</code> and <code>DROP</code> <b>implicitly commits</b>, and can't be rolled back.</li></ul>`,
            viz: `<div class="model-row">
              <div class="slab pop code" style="--c:var(--s5)"><div class="slab-title">autocommit = 1 (default)</div><pre>UPDATE products SET …;  -- saved
DELETE FROM orders …;   -- saved</pre><small>each statement commits on its own</small></div>
              <div class="slab pop code" style="--c:var(--s3);--d:.2s"><div class="slab-title">explicit transaction</div><pre>START TRANSACTION;
UPDATE products SET …;
DELETE FROM orders …;
COMMIT;                 -- saved together</pre><small>one unit of work</small></div></div>`,
          },
          {
            title: 'Isolation: what others can see', short: 'Isolation',
            body: `<p>While your transaction is open, other sessions keep seeing the <b>last committed</b> data. InnoDB's default level is <code>REPEATABLE READ</code>: inside one transaction, reading the same rows again gives the same answer.</p>
              <p>Rows you're changing are <b>locked</b>. Another session trying to update the same row waits until you COMMIT or ROLLBACK, so keep transactions short.</p>`,
            viz: `<div class="model-row">
              <div class="slab pop code" style="--c:var(--s1)"><div class="slab-title">Session A</div><pre>START TRANSACTION;
UPDATE products
  SET stock = 23
  WHERE id = 1;
<span class="t">…thinking…</span>
COMMIT;</pre></div>
              <div class="slab pop code" style="--c:var(--s2);--d:.2s"><div class="slab-title">Session B</div><pre>SELECT stock … id = 1;
<span class="t">→ 25 (old value)</span>
UPDATE products … id = 1;
<span class="t">⏳ waits for A's lock</span>
<span class="t">→ runs after A commits</span></pre></div></div>`,
          },
          {
            title: 'SAVEPOINT: a partial undo', short: 'SAVEPOINT',
            sql: "START TRANSACTION;\nUPDATE products SET stock = stock - 1 WHERE id = 1;\nSAVEPOINT before_mugs;\nUPDATE products SET stock = 0 WHERE id = 7;\nROLLBACK TO SAVEPOINT before_mugs;\nCOMMIT;\nSELECT id, name, stock FROM products WHERE id IN (1, 7);",
            body: `<p><code>SAVEPOINT name</code> bookmarks a moment inside a transaction. <code>ROLLBACK TO SAVEPOINT name</code> undoes only what happened <b>after</b> it. The transaction stays open, and the earlier work survives.</p>
              <p>Here the keyboard's stock change is kept and the mug's is undone. <code>RELEASE SAVEPOINT name</code> drops a bookmark you no longer need.</p>
              <p><i>SQL Server calls this <code>SAVE TRANSACTION</code>; in MySQL it's SAVEPOINT.</i></p>`,
            key: 'Savepoints let a long transaction recover from one failed step without starting over.',
          },
          {
            title: 'Your turn: a safe sale', short: 'Challenge',
            sql: "-- in ONE transaction: Hana (customer 8) buys 3 Gel Pen Sets (product 5) on 2024-08-10\n-- record the order AND reduce the stock, then COMMIT\n",
            expect: "START TRANSACTION; INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (8, 5, 3, '2024-08-10'); UPDATE products SET stock = stock - 3 WHERE id = 5; COMMIT;",
            verify: "SELECT (SELECT stock FROM products WHERE id = 5) AS stock, (SELECT COUNT(*) FROM orders WHERE customer_id = 8 AND product_id = 5 AND quantity = 3 AND ordered_on = '2024-08-10') AS orders",
            body: `<p>Hana (customer <code>8</code>) buys <b>3</b> Gel Pen Sets (product <code>5</code>) on <code>2024-08-10</code>.</p>
              <p>In one transaction, insert the order <b>and</b> reduce the product's stock by 3, then commit.</p>`,
          },
        ],
      },
    ],
  },
  {
    title: 'Designing Tables',
    lessons: [
      {
        id: 'create-table', title: 'CREATE TABLE & Data Types', minutes: 14, level: 'Intermediate',
        summary: 'Design a table from scratch, pick the right types, then reshape or remove it.',
        learn: ['The <code>CREATE TABLE</code> syntax', 'Whole numbers, exact decimals and why not FLOAT for money',
          '<code>VARCHAR</code>, <code>TEXT</code> and <code>ENUM</code>', '<code>DATE</code>, <code>DATETIME</code>, <code>TIMESTAMP</code> and defaults',
          'Changing tables with <code>ALTER</code>, removing them with <code>DROP</code>'],
        steps: [
          {
            title: 'A table is a contract', short: 'Blueprint',
            body: `<p>Before a table holds any data, you describe its <b>shape</b>: every column, its <b>data type</b>, and the rules it must follow.</p>
              <p>MySQL then enforces that contract on every INSERT and UPDATE, forever. Good types catch bugs early, save disk and memory, and make indexes faster.</p>`,
            key: 'Pick the smallest type that will always fit the data, not the biggest one that might.',
            viz: `<div class="model-row">
              <div class="slab schema pop" style="--c:var(--s3)"><div class="slab-title">CREATE TABLE suppliers</div><table>
                <tr class="pop" style="--d:.1s"><td class="sc-name">id</td><td class="sc-type">INT</td><td><span class="chip pk">PK</span><span class="chip ai">AUTO_INCREMENT</span></td></tr>
                <tr class="pop" style="--d:.3s"><td class="sc-name">name</td><td class="sc-type">VARCHAR(60)</td><td><span class="chip nn">NOT NULL</span></td></tr>
                <tr class="pop" style="--d:.5s"><td class="sc-name">rating</td><td class="sc-type">DECIMAL(3,1)</td><td></td></tr>
                <tr class="pop" style="--d:.7s"><td class="sc-name">created_at</td><td class="sc-type">DATETIME</td><td><span class="chip df">DEFAULT CURRENT_TIMESTAMP</span></td></tr></table></div>
              <div class="stack">
                <div class="block pop" style="--c:var(--s5);--d:.4s"><b>name</b><small>what to call it</small></div>
                <div class="block pop" style="--c:var(--s3);--d:.6s"><b>type</b><small>what kind of value fits</small></div>
                <div class="block pop" style="--c:var(--s4);--d:.8s"><b>rules</b><small>NOT NULL, DEFAULT, keys…</small></div>
              </div></div>`,
          },
          {
            title: 'Create your first table', short: 'CREATE',
            sql: "CREATE TABLE suppliers (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  name VARCHAR(60) NOT NULL,\n  country VARCHAR(40),\n  rating DECIMAL(3,1),\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);\nDESCRIBE suppliers;",
            body: `<p>Each line inside the parentheses is one column: <b>name</b>, <b>type</b>, then optional <b>rules</b>.</p>
              <ul><li><code>INT AUTO_INCREMENT PRIMARY KEY</code>: a whole number that MySQL numbers for you.</li>
              <li><code>VARCHAR(60)</code>: text of up to 60 characters.</li>
              <li><code>DECIMAL(3,1)</code>: 3 digits in total, 1 after the point, so 0.0 to 99.9.</li></ul>
              <p>Real MySQL scripts often end with <code>ENGINE=InnoDB</code>. InnoDB is the default engine, so you can leave it out.</p>`,
          },
          {
            title: 'Numbers: INT, DECIMAL… and not FLOAT', short: 'Numbers',
            body: `<ul><li><b>Whole numbers</b>: <code>TINYINT</code> (−128…127), <code>SMALLINT</code>, <code>INT</code> (±2.1 billion), <code>BIGINT</code>. Add <code>UNSIGNED</code> to double the positive range.</li>
              <li><b>Exact decimals</b>: <code>DECIMAL(p,s)</code>, stored digit for digit. Use it for <b>money</b>.</li>
              <li><b>Approximate</b>: <code>FLOAT</code> / <code>DOUBLE</code>, which are fast but binary fractions, so 0.1 + 0.2 ≠ 0.3. Fine for sensor readings, wrong for prices.</li></ul>`,
            key: 'Money is always DECIMAL. A FLOAT price will be off by a fraction of a cent, and eventually someone notices.',
            viz: `<div class="model-row">
              <div class="slab pop code" style="--c:var(--s2)"><div class="slab-title">INT</div><pre>42
-7
2147483647  -- max</pre><small>counts, ids, quantities</small></div>
              <div class="slab pop code good" style="--c:var(--s6);--d:.15s"><div class="slab-title">DECIMAL(8,2)</div><pre>0.10 + 0.20
= 0.30  ✓</pre><small>money, exact amounts</small></div>
              <div class="slab pop code bad" style="--c:var(--s4);--d:.3s"><div class="slab-title">FLOAT</div><pre>0.1 + 0.2
= 0.30000000000000004</pre><small>approximate values only</small></div></div>`,
          },
          {
            title: 'Text: VARCHAR, TEXT and ENUM', short: 'Text',
            sql: "CREATE TABLE tickets (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  title VARCHAR(20) NOT NULL,\n  details TEXT,\n  status ENUM('open', 'closed') NOT NULL DEFAULT 'open'\n);\nINSERT INTO tickets (title) VALUES ('Printer jammed');\nINSERT INTO tickets (title, status) VALUES ('Refund request', 'closed');\nSELECT * FROM tickets;",
            body: `<ul><li><code>VARCHAR(n)</code>: up to <i>n</i> characters. The usual choice for names, emails and titles.</li>
              <li><code>TEXT</code>: long free text (up to 64 KB) such as comments and descriptions.</li>
              <li><code>ENUM('a','b')</code>: exactly one value from a fixed list, which is great for statuses.</li></ul>
              <p>The first ticket gets <code>status = 'open'</code> from the DEFAULT.</p>`,
          },
          {
            title: 'MySQL guards the type', short: 'Guards',
            pre: "CREATE TABLE tickets (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(20) NOT NULL, details TEXT, status ENUM('open', 'closed') NOT NULL DEFAULT 'open');\nINSERT INTO tickets (title) VALUES ('Printer jammed');",
            sql: "INSERT INTO tickets (title)\nVALUES ('This title is far too long for it');",
            body: `<p>The title has 34 characters, but the column allows 20. In strict mode (the default since MySQL 5.7), the insert fails with <b>error 1406: Data too long</b>.</p>
              <p>In the Editor, also try <code>status = 'pending'</code>, which isn't in the ENUM list (error 1265), or the text <code>'abc'</code> in an <code>INT</code> column (error 1366).</p>`,
            key: 'Strict mode turns silent data corruption into a loud error. Keep it on.',
          },
          {
            title: 'Dates and times', short: 'Dates',
            sql: "CREATE TABLE deliveries (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  due_on DATE NOT NULL,\n  arrived_at DATETIME,\n  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);\nINSERT INTO deliveries (due_on) VALUES ('2024-09-01');\nSELECT * FROM deliveries;",
            body: `<ul><li><code>DATE</code>: a calendar day, written <code>'YYYY-MM-DD'</code>.</li>
              <li><code>DATETIME</code>: a date and time, stored exactly as given.</li>
              <li><code>TIMESTAMP</code>: a moment in time, stored in UTC and converted to your session's time zone. Its range ends in 2038.</li></ul>
              <p><code>DEFAULT CURRENT_TIMESTAMP</code> stamps each row as it's created. Add <code>ON UPDATE CURRENT_TIMESTAMP</code> and the stamp refreshes on every change.</p>`,
          },
          {
            title: 'Change a table: ALTER TABLE', short: 'ALTER',
            pre: "CREATE TABLE suppliers (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(60) NOT NULL, country VARCHAR(40));\nINSERT INTO suppliers (name, country) VALUES ('Acme Paper', 'India'), ('Lumen Lights', 'Germany');",
            sql: "ALTER TABLE suppliers\n  ADD COLUMN email VARCHAR(100);\nUPDATE suppliers SET email = 'sales@acme.test' WHERE id = 1;\nSELECT * FROM suppliers;",
            body: `<p><code>ALTER TABLE … ADD COLUMN</code> adds a column to a table that already has data. Existing rows get <code>NULL</code>, or the column's DEFAULT.</p>
              <p>Other changes you'll use: <code>RENAME COLUMN a TO b</code>, <code>MODIFY COLUMN</code> to change a type, and <code>DROP COLUMN</code>.</p>`,
            key: 'On a big table, ALTER can rewrite every row. Test schema changes on a copy before you run them in production.',
          },
          {
            title: 'Remove a table: DROP TABLE', short: 'DROP',
            pre: "CREATE TABLE tickets (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(20) NOT NULL);\nINSERT INTO tickets (title) VALUES ('Printer jammed'), ('Refund request');",
            sql: "DROP TABLE tickets;\nSHOW TABLES;",
            body: `<p><code>DROP TABLE</code> deletes the structure <b>and</b> every row. It commits immediately, so a ROLLBACK can't bring it back.</p>
              <p>In scripts, write <code>DROP TABLE IF EXISTS t</code> so the script doesn't fail when the table is already gone.</p>`,
          },
          {
            title: 'Your turn: a coupons table', short: 'Challenge',
            sql: '-- create the coupons table here\n',
            expect: 'CREATE TABLE coupons (id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(20) NOT NULL, percent_off INT NOT NULL, expires_on DATE);',
            verify: "INSERT OR IGNORE INTO coupons (code, percent_off, expires_on) VALUES ('SAVE10', 10, '2024-12-31');\nINSERT OR IGNORE INTO coupons (code, percent_off) VALUES ('NOEXPIRY', 5);\nINSERT OR IGNORE INTO coupons (code, percent_off) VALUES (NULL, 5);\nINSERT OR IGNORE INTO coupons (code, percent_off) VALUES ('NOPERCENT', NULL);\nINSERT OR IGNORE INTO coupons (code, percent_off) VALUES ('THIS-CODE-IS-WAY-TOO-LONG', 5);\nSELECT id, code, percent_off, expires_on FROM coupons",
            body: `<p>Create a table <code>coupons</code> with:</p>
              <ul><li><code>id</code>: auto-numbered primary key</li><li><code>code</code>: text of up to <b>20</b> characters, required</li>
              <li><code>percent_off</code>: a whole number, required</li><li><code>expires_on</code>: a date, optional</li></ul>
              <p>The checker inserts test rows to see how your table behaves.</p>`,
          },
        ],
      },
      {
        id: 'keys-constraints', title: 'Keys & Constraints', minutes: 14, level: 'Intermediate',
        summary: 'Let the database enforce your rules, so bad data can’t get in.',
        learn: ['Primary keys: natural vs surrogate', '<code>UNIQUE</code> and <code>NOT NULL</code>', '<code>CHECK</code> for business rules',
          '<code>FOREIGN KEY</code>, <code>ON DELETE CASCADE</code> and friends', 'Composite keys and junction tables'],
        steps: [
          {
            title: 'Primary keys and other rules', short: 'Why',
            body: `<p>Your app validates input, but so do the admin script, the import job, and the intern with a SQL console. <b>Constraints</b> are checks that MySQL runs on every write, no matter who sends it.</p>
              <p>A <b>primary key</b> can be <i>natural</i> (an ISBN, a country code) or <i>surrogate</i> (an AUTO_INCREMENT id). Surrogate keys never change, so they make the safest default.</p>`,
            key: 'App checks give friendly messages. Database constraints are what actually keep the data correct.',
            viz: `<div class="model-row" style="max-width:640px">
              <div class="block pop" style="--c:var(--s1)"><b>PRIMARY KEY</b><small>unique + not null: the row’s identity</small></div>
              <div class="block pop" style="--c:var(--s3);--d:.1s"><b>UNIQUE</b><small>no two rows share this value</small></div>
              <div class="block pop" style="--c:var(--s5);--d:.2s"><b>NOT NULL</b><small>a value is required</small></div>
              <div class="block pop" style="--c:var(--s4);--d:.3s"><b>CHECK</b><small>any rule: price &gt; 0</small></div>
              <div class="block pop" style="--c:var(--s6);--d:.4s"><b>FOREIGN KEY</b><small>must point at a real row</small></div></div>`,
          },
          {
            title: 'UNIQUE and NOT NULL', short: 'UNIQUE',
            sql: "CREATE TABLE members (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  email VARCHAR(100) NOT NULL UNIQUE,\n  nickname VARCHAR(30)\n);\nINSERT INTO members (email, nickname) VALUES ('ana@example.com', 'ana');\nINSERT INTO members (email, nickname) VALUES ('ana@example.com', 'ana2');",
            body: `<p>The first member gets in. The second one uses the same email, so the <code>UNIQUE</code> constraint rejects it with <b>error 1062</b>.</p>
              <p>A UNIQUE column can still hold many <code>NULL</code>s, because unknown values aren't equal to each other. Add <code>NOT NULL</code> when the value is required.</p>`,
          },
          {
            title: 'CHECK: your business rules', short: 'CHECK',
            sql: "CREATE TABLE price_tags (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  product_id INT NOT NULL,\n  price DECIMAL(8,2) NOT NULL CHECK (price > 0)\n);\nINSERT INTO price_tags (product_id, price) VALUES (1, 89.00);\nINSERT INTO price_tags (product_id, price) VALUES (2, -5);",
            body: `<p><code>CHECK (condition)</code> rejects any row where the condition is false. A negative price fails with <b>error 3819</b>.</p>
              <p>Name a check to make errors readable: <code>CONSTRAINT price_positive CHECK (price &gt; 0)</code>.</p>
              <p><i>MySQL only enforces CHECK from 8.0.16 on. Older versions parse it and then silently ignore it.</i></p>`,
          },
          {
            title: 'FOREIGN KEY: links that can’t break', short: 'FK',
            sql: "CREATE TABLE reviews (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  product_id INT NOT NULL,\n  rating TINYINT NOT NULL,\n  FOREIGN KEY (product_id) REFERENCES products(id)\n);\nINSERT INTO reviews (product_id, rating) VALUES (1, 5);\nINSERT INTO reviews (product_id, rating) VALUES (99, 4);",
            body: `<p>A foreign key says "this value must exist over there". Product 1 exists. Product 99 doesn't, so MySQL refuses the review with <b>error 1452</b>.</p>
              <p>This is the same rule that stopped you from deleting Asha back in the DELETE lesson, seen from the other side.</p>`,
            key: 'Foreign keys also need an index on the referencing column. InnoDB creates one automatically if you don’t.',
          },
          {
            title: 'ON DELETE CASCADE', short: 'CASCADE',
            pre: "CREATE TABLE wishlists (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  customer_id INT NOT NULL,\n  product_id INT NOT NULL,\n  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE\n);\nINSERT INTO wishlists (customer_id, product_id) VALUES (7, 1), (7, 6), (8, 2);",
            sql: "DELETE FROM customers WHERE id = 7;\nSELECT * FROM wishlists;",
            body: `<p>Gus (id 7) has two wishlist items. The foreign key says <code>ON DELETE CASCADE</code>, so deleting Gus <b>also deletes his wishlist rows</b> in the same statement.</p>
              <ul><li><code>RESTRICT</code> (the default) refuses the delete.</li><li><code>CASCADE</code> deletes the children too.</li><li><code>SET NULL</code> keeps the children but clears the link.</li></ul>`,
            key: 'CASCADE suits rows that are meaningless without their parent, like wishlist items. Never use it on orders or invoices.',
          },
          {
            title: 'Composite keys', short: 'Composite',
            sql: "CREATE TABLE order_items (\n  order_id INT NOT NULL,\n  product_id INT NOT NULL,\n  quantity INT NOT NULL DEFAULT 1,\n  PRIMARY KEY (order_id, product_id)\n);\nINSERT INTO order_items (order_id, product_id) VALUES (1, 1), (1, 4);\nINSERT INTO order_items (order_id, product_id) VALUES (1, 4);",
            body: `<p>A primary key can span <b>several columns</b>. Here the <i>pair</i> (order, product) must be unique: one order can hold many products, but each product appears only once per order.</p>
              <p>A table like this is a <b>junction table</b>. It's how you model a many-to-many relationship.</p>`,
          },
          {
            title: 'Your turn: product reviews', short: 'Challenge',
            sql: '-- create the reviews table here\n',
            expect: 'CREATE TABLE reviews (id INT AUTO_INCREMENT PRIMARY KEY, product_id INT NOT NULL, rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5), body TEXT, FOREIGN KEY (product_id) REFERENCES products(id));',
            verify: "INSERT OR IGNORE INTO reviews (product_id, rating, body) VALUES (1, 5, 'Great');\nINSERT OR IGNORE INTO reviews (product_id, rating, body) VALUES (1, 9, 'too high');\nINSERT OR IGNORE INTO reviews (product_id, rating, body) VALUES (2, 0, 'too low');\nINSERT OR IGNORE INTO reviews (product_id, rating, body) VALUES (NULL, 3, 'no product');\nINSERT OR IGNORE INTO reviews (product_id, rating) VALUES (3, 4);\nSELECT id, product_id, rating, body FROM reviews UNION ALL SELECT 'fk', \"table\", 0, NULL FROM pragma_foreign_key_list('reviews')",
            body: `<p>Create a table <code>reviews</code> with:</p>
              <ul><li><code>id</code>: auto-numbered primary key</li><li><code>product_id</code>: required, and must reference <code>products(id)</code></li>
              <li><code>rating</code>: a required whole number that must be <b>between 1 and 5</b></li><li><code>body</code>: optional long text</li></ul>`,
          },
        ],
      },
      {
        id: 'normalization', title: 'Normalization', minutes: 12, level: 'Intermediate',
        summary: 'Store each fact once, and know when to break that rule.',
        learn: ['Spotting duplicated data and its anomalies', 'First normal form: one value per cell',
          'Second and third normal form in plain words', 'Splitting a table and joining it back', 'When denormalizing is the right call'],
        steps: [
          {
            title: 'One big table looks easy…', short: 'Problem',
            body: `<p>Putting everything in one table feels simple, until the same fact is stored over and over. Asha's email appears in every one of her orders.</p>
              <ul><li><b>Update anomaly</b>: you change her email in one row, and the others disagree.</li>
              <li><b>Insert anomaly</b>: you can't store a customer until they've ordered something.</li>
              <li><b>Delete anomaly</b>: delete Ben's only order, and Ben himself disappears.</li></ul>`,
            viz: `<div class="model-row"><div class="slab pop flat" style="--c:var(--s4)"><div class="slab-title">orders_flat</div>
              <table><tr class="cols"><th>order_id</th><th>customer</th><th>email</th><th>product</th><th>price</th></tr>
              <tr><td>1</td><td class="rep">Asha Rao</td><td class="rep">asha.rao@gmail.com</td><td>Mechanical Keyboard</td><td>89.00</td></tr>
              <tr><td>2</td><td class="rep">Asha Rao</td><td class="rep">asha.rao@gmail.com</td><td>Notebook A5</td><td>6.00</td></tr>
              <tr><td>11</td><td class="rep">Asha Rao</td><td class="rep">asha.rao@gmail.com</td><td>Coffee Mug</td><td>9.50</td></tr>
              <tr><td>3</td><td>Ben Carter</td><td>ben@carter.co.uk</td><td>Wireless Mouse</td><td>29.50</td></tr></table></div></div>
              <div class="model-cap">The same customer facts are copied into <b>three</b> rows.</div>`,
          },
          {
            title: 'The update anomaly, live', short: 'Anomaly',
            pre: "CREATE TABLE orders_flat (\n  order_id INT PRIMARY KEY,\n  customer VARCHAR(50),\n  email VARCHAR(100),\n  product VARCHAR(80),\n  price DECIMAL(8,2)\n);\nINSERT INTO orders_flat VALUES\n (1, 'Asha Rao', 'asha.rao@gmail.com', 'Mechanical Keyboard', 89.00),\n (2, 'Asha Rao', 'asha.rao@gmail.com', 'Notebook A5', 6.00),\n (11, 'Asha Rao', 'asha.rao@gmail.com', 'Coffee Mug', 9.50),\n (3, 'Ben Carter', 'ben@carter.co.uk', 'Wireless Mouse', 29.50);",
            sql: "UPDATE orders_flat\nSET email = 'asha@newmail.com'\nWHERE order_id = 1;\nSELECT customer, email FROM orders_flat WHERE customer = 'Asha Rao';",
            body: `<p>Asha changed her email. The support agent updated the order they were looking at, which is <b>one</b> row.</p>
              <p>Now the database says Asha has two different emails. Which one is true? The data can't tell you any more.</p>`,
            key: 'When a fact is stored in many places, sooner or later the copies disagree.',
          },
          {
            title: '1NF: one value per cell', short: '1NF',
            body: `<p><b>First normal form</b>: every cell holds <b>one</b> value, and there are no repeating groups like <code>product1, product2, product3</code> columns.</p>
              <p>A list squeezed into one cell can't be searched, indexed, joined or validated. Give each item its own row.</p>`,
            viz: `<div class="model-row">
              <div class="slab pop" style="--c:var(--s4)"><div class="slab-title">✗ not 1NF</div><table><tr class="cols"><th>order_id</th><th>products</th></tr>
                <tr><td>1</td><td class="bad-cell">Keyboard, Notebook</td></tr><tr><td>3</td><td>Mouse</td></tr></table></div>
              <span class="flow-arrow">→</span>
              <div class="slab pop" style="--c:var(--s6);--d:.2s"><div class="slab-title">✓ 1NF</div><table><tr class="cols"><th>order_id</th><th>product</th></tr>
                <tr><td>1</td><td>Keyboard</td></tr><tr><td>1</td><td>Notebook</td></tr><tr><td>3</td><td>Mouse</td></tr></table></div></div>`,
          },
          {
            title: '2NF & 3NF: facts depend on the key', short: '2NF / 3NF',
            body: `<p>Every non-key column should describe <b>the key, the whole key, and nothing but the key</b>.</p>
              <ul><li><b>2NF</b>: with a composite key, no column may depend on only <i>part</i> of it.</li>
              <li><b>3NF</b>: no column may depend on another non-key column. <code>email</code> depends on the <i>customer</i>, not on the order, so it moves to its own table.</li></ul>
              <p>That split is exactly how our shop database is built: <code>customers</code>, <code>products</code>, <code>orders</code>.</p>`,
            viz: `<div class="model-row"><div class="dep pop">
              <div><span class="k">order_id</span><span class="arrow-r">→</span><span class="v">product</span><span class="v">quantity</span><span class="v">ordered_on</span></div>
              <div><span class="k">order_id</span><span class="arrow-r">→</span><span class="v wrong">email ✗</span><span class="arrow-r">depends on the customer, not the order</span></div>
              <div><span class="k">customer_id</span><span class="arrow-r">→</span><span class="v">name</span><span class="v">email ✓</span><span class="v">city</span></div>
            </div></div>`,
          },
          {
            title: 'Fixed: one fact, one place', short: 'Normalized',
            sql: "UPDATE customers\nSET email = 'asha@newmail.com'\nWHERE id = 1;\nSELECT o.id AS order_id, c.name, c.email\nFROM orders o JOIN customers c ON c.id = o.customer_id\nWHERE c.id = 1;",
            body: `<p>In the normalized shop, Asha's email lives in exactly <b>one row</b>. Update it once, and every one of her orders reflects the change through the JOIN.</p>`,
            key: 'Normalize so that writes stay correct. Use JOINs to put the pieces back together when you read.',
          },
          {
            title: 'When to break the rules', short: 'Trade-offs',
            body: `<p>Normalized data is easy to keep correct, but some reads have to JOIN many tables. Sometimes you <b>denormalize on purpose</b>:</p>
              <ul><li>a cached <code>order_count</code> on customers, so you don't have to COUNT on every page view</li>
              <li>copying the <b>price at the time of sale</b> into the order, because history must not change when the product price does</li>
              <li>reporting tables rebuilt each night</li></ul>
              <p>Denormalize only when you've measured a real need, and decide who keeps the copy up to date.</p>`,
            viz: `<div class="model-row">
              <div class="slab pop code good" style="--c:var(--s6)"><div class="slab-title">normalized</div><pre>+ one source of truth
+ simple, safe writes
− reads need JOINs</pre></div>
              <div class="slab pop code" style="--c:var(--s1);--d:.2s"><div class="slab-title">denormalized</div><pre>+ fast, simple reads
− copies can drift
− every write does more</pre></div></div>`,
          },
          {
            title: 'Your turn: normalize the categories', short: 'Challenge',
            sql: '-- 1) create table categories\n-- 2) fill it from products with INSERT … SELECT\n',
            expect: 'CREATE TABLE categories (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(30) NOT NULL UNIQUE); INSERT INTO categories (name) SELECT DISTINCT category FROM products;',
            verify: "INSERT OR IGNORE INTO categories (name) VALUES ('Home');\nINSERT OR IGNORE INTO categories (name) VALUES (NULL);\nSELECT name FROM categories",
            body: `<p>Category names are repeated across products. Create a table <code>categories</code> with an auto-numbered <code>id</code> and a <code>name</code> (up to 30 characters, required, <b>unique</b>).</p>
              <p>Then fill it with each distinct category from <code>products</code>. You can insert the result of a query:</p>
              <p><code>INSERT INTO t (col) SELECT … FROM …;</code></p>`,
          },
        ],
      },
    ],
  },
  {
    title: 'Performance',
    lessons: [
      {
        id: 'indexes', title: 'Indexes', minutes: 15, level: 'Intermediate', setup: PAGE_VIEWS,
        summary: 'Turn a 50,000-row scan into a handful of reads.',
        learn: ['What an index is: a sorted B-tree', 'Full table scan vs index lookup', '<code>CREATE INDEX</code> and <code>SHOW INDEX</code>',
          'Composite indexes and the leftmost-prefix rule', 'Covering indexes, and what indexes cost'],
        steps: [
          {
            title: 'Finding a needle', short: 'Why',
            body: `<p>This lesson adds a big table: <code>page_views</code>, with <b>50,000 rows</b> (one per visit: <code>user_id</code>, <code>url</code>, <code>country</code>, <code>viewed_at</code>).</p>
              <p>To find one user's visits without help, MySQL must read <b>every</b> row and check it. An <b>index</b> works like the index at the back of a book: look the value up in a sorted list, then jump straight to the right pages.</p>`,
            key: 'An index trades a little disk space and slower writes for dramatically faster reads.',
            viz: `<div class="model-row">
              <div class="slab pop code bad" style="--c:var(--s4)"><div class="slab-title">without an index</div><pre>row 1 … user 7920?  no
row 2 … user 4839?  no
row 3 … user 2758?  no
… 49,997 more checks</pre><small>reads every page of the book</small></div>
              <div class="slab pop code good" style="--c:var(--s6);--d:.2s"><div class="slab-title">with an index</div><pre>index: … 1233 → 1234 → 1235 …
       user 1234 → rows
       5246, 10246, 15246 …</pre><small>looks it up, jumps to the pages</small></div></div>`,
          },
          {
            title: 'A full table scan', short: 'Full scan',
            scene: 'plan',
            sql: 'SELECT * FROM page_views WHERE user_id = 1234;',
            body: `<p>There's no index on <code>user_id</code>, so MySQL reads all <b>50,000</b> rows to find the <b>10</b> that match.</p>
              <p>Watch the counter, and the time. Run it in the Editor too: MySQL's client reports the time as <code>(0.00x sec)</code>.</p>`,
          },
          {
            title: 'Create an index', short: 'CREATE INDEX',
            sql: 'SELECT * FROM page_views WHERE user_id = 1234;\nCREATE INDEX idx_user ON page_views (user_id);\nSELECT * FROM page_views WHERE user_id = 1234;',
            body: `<p>The same query, before and after <code>CREATE INDEX</code>. The index is a sorted copy of <code>user_id</code> where each entry points to its row.</p>
              <p>Now MySQL walks down the tree to <code>1234</code> and reads only the <b>10</b> matching rows: the access type changes from <code>ALL</code> to <code>ref</code>.</p>`,
            key: 'Index the columns you filter on (WHERE), join on (ON) and sort by (ORDER BY).',
          },
          {
            title: 'Inside the B-tree', short: 'B-tree',
            body: `<p>InnoDB indexes are <b>B+trees</b>. The root and branch nodes hold separator keys, and the leaves hold every value, in order, with a pointer to the row.</p>
              <p>Each node holds hundreds of keys, so even millions of rows need only 3–4 levels. That's 3–4 page reads per lookup instead of millions.</p>
              <p>And since the leaves are sorted and linked, <b>ranges</b> (<code>BETWEEN</code>, <code>&gt;</code>) and <b>ORDER BY</b> come almost free.</p>`,
            viz: `<div class="model-row"><div class="btree pop" style="--tc:var(--good)">
              <div class="bt-level"><div class="bt-node on">2500</div></div>
              <div class="bt-level"><div class="bt-node on">834 · 1667</div><div class="bt-node">3334 · 4167</div></div>
              <div class="bt-level"><div class="bt-node leaf">1 …</div><div class="bt-node leaf on">834 … 1234 …</div><div class="bt-node leaf">1667 …</div><div class="bt-node leaf">2500 …</div><div class="bt-node leaf">3334 …</div><div class="bt-node leaf">4167 …</div></div>
              <div class="bt-cap">root → branch → leaf: 3 steps to find user 1234 among 50,000 rows</div></div></div>`,
          },
          {
            title: 'Ranges and ORDER BY', short: 'Ranges',
            pre: 'CREATE INDEX idx_viewed ON page_views (viewed_at);',
            sql: "EXPLAIN SELECT id, url FROM page_views\nWHERE viewed_at BETWEEN '2024-03-01' AND '2024-03-02'\nORDER BY viewed_at;",
            body: `<p>With an index on <code>viewed_at</code>, MySQL jumps to <code>2024-03-01</code> in the leaves and walks forward until it passes <code>2024-03-02</code>. That gives type <code>range</code>, about 137 rows.</p>
              <p>Notice there's no <code>Using filesort</code>: the rows come out of the index already in order.</p>`,
          },
          {
            title: 'Composite indexes & the leftmost rule', short: 'Composite',
            pre: 'CREATE INDEX idx_country_user ON page_views (country, user_id);',
            sql: "EXPLAIN SELECT * FROM page_views WHERE country = 'IN' AND user_id = 77;\nEXPLAIN SELECT * FROM page_views WHERE user_id = 77;",
            body: `<p>An index on <code>(country, user_id)</code> is sorted by country first, then by user within each country, like a phone book sorted by surname, then first name.</p>
              <ul><li>Filtering on <code>country</code>, or on <code>country</code> + <code>user_id</code>, uses it.</li>
              <li>Filtering on <code>user_id</code> <b>alone</b> can't. It's like finding everyone named "Ana" in a phone book sorted by surname, so you get a full scan.</li></ul>`,
            key: 'A composite index works from its leftmost column. Put the column you always filter on first.',
          },
          {
            title: 'Covering indexes', short: 'Covering',
            pre: 'CREATE INDEX idx_country_user ON page_views (country, user_id);',
            sql: "EXPLAIN SELECT user_id FROM page_views WHERE country = 'IN';",
            body: `<p>This query needs only <code>country</code> and <code>user_id</code>, and both are <b>inside the index</b>. MySQL answers from the index alone and never touches the table. EXPLAIN shows this as <code>Using index</code>.</p>
              <p>That's one more reason to avoid <code>SELECT *</code>: it rules out covering indexes.</p>`,
          },
          {
            title: 'Indexes aren’t free', short: 'Costs',
            body: `<ul><li>Every <code>INSERT</code>, <code>UPDATE</code> and <code>DELETE</code> must also update <b>every index</b> on the table.</li>
              <li>Each index takes disk space and memory in the buffer pool.</li>
              <li>Low-selectivity columns make poor indexes on their own. With only 10 countries, each value matches 10% of the table.</li>
              <li>Unused indexes are pure cost. Check <code>sys.schema_unused_indexes</code> in MySQL.</li></ul>
              <p>Use <code>SHOW INDEX FROM page_views;</code> to list indexes. The <b>Cardinality</b> column estimates how many distinct values each one has.</p>`,
            viz: `<div class="model-row">
              <div class="block pop" style="--c:var(--s6)"><b>reads</b><small>faster with the right index</small></div>
              <div class="block pop" style="--c:var(--s4);--d:.15s"><b>writes</b><small>slower with every index</small></div>
              <div class="block pop" style="--c:var(--s5);--d:.3s"><b>space</b><small>each index is another B-tree</small></div></div>`,
          },
          {
            title: 'Your turn: speed up a page', short: 'Challenge',
            sql: "-- this query runs on every product page view:\n--   SELECT id, viewed_at FROM page_views WHERE url = '/products/42';\n-- create an index so it no longer scans 50,000 rows\n",
            expect: 'CREATE INDEX idx_url ON page_views (url);',
            verify: "SELECT COUNT(*) > 0 FROM pragma_index_list('page_views') il JOIN pragma_index_info(il.name) ii WHERE ii.seqno = 0 AND ii.name = 'url'",
            body: `<p>The product page runs <code>SELECT id, viewed_at FROM page_views WHERE url = '/products/42'</code> thousands of times an hour.</p>
              <p>Add an index that MySQL can use for it, then check with <code>EXPLAIN</code> that the type is no longer <code>ALL</code>.</p>`,
          },
        ],
      },
      {
        id: 'explain', title: 'Reading EXPLAIN', minutes: 12, level: 'Advanced',
        summary: 'Ask MySQL how it will run a query, and spot the slow parts before your users do.',
        learn: ['Running <code>EXPLAIN</code>', 'The <code>type</code> column, from <code>const</code> to <code>ALL</code>', '<code>key</code> and <code>rows</code>',
          'Extra: <code>Using filesort</code>, <code>Using temporary</code>, <code>Using index</code>', 'Reading a JOIN plan as nested loops'],
        steps: [
          {
            title: 'Ask MySQL for its plan', short: 'EXPLAIN',
            sql: "EXPLAIN SELECT * FROM customers WHERE city = 'Mumbai';",
            body: `<p>Put <code>EXPLAIN</code> in front of a SELECT and MySQL shows its plan <b>without running the query</b>. One row per table:</p>
              <ul><li><b>type</b>: how the table is accessed (the most important column)</li><li><b>key</b>: the index used, if any</li>
              <li><b>rows</b>: how many rows MySQL expects to examine</li><li><b>Extra</b>: notes such as sorting or temp tables</li></ul>
              <p>Here: <code>ALL</code> with no key means a full scan, because there's no index on <code>city</code>.</p>`,
          },
          {
            title: 'The type column, best to worst', short: 'Types',
            body: `<ul><li><code>const</code>: at most one row, by primary key or unique key</li>
              <li><code>eq_ref</code>: one row per row of the previous table (a join on a primary key)</li>
              <li><code>ref</code>: a few rows through a non-unique index</li>
              <li><code>range</code>: an index range (BETWEEN, &gt;, IN)</li>
              <li><code>index</code>: reads the whole index</li>
              <li><code>ALL</code>: reads the whole table</li></ul>`,
            key: 'ALL on a big table inside a frequent query is the first thing to fix.',
            viz: `<div class="model-row" style="max-width:560px">
              <div class="block pop" style="--c:var(--s2)"><b>const</b><small>1 row, by key</small></div>
              <div class="block pop" style="--c:var(--s2);--d:.1s"><b>eq_ref</b><small>1 row per join row</small></div>
              <div class="block pop" style="--c:var(--s6);--d:.2s"><b>ref</b><small>a few rows via index</small></div>
              <div class="block pop" style="--c:var(--s1);--d:.3s"><b>range</b><small>a slice of the index</small></div>
              <div class="block pop" style="--c:var(--s4);--d:.4s"><b>index</b><small>the whole index</small></div>
              <div class="block pop" style="--c:var(--bad);--d:.5s"><b>ALL</b><small>the whole table</small></div></div>`,
          },
          {
            title: 'const: one row by primary key', short: 'const',
            sql: 'EXPLAIN SELECT * FROM customers WHERE id = 3;',
            body: `<p>A primary key lookup with a constant is the best case: <code>type = const</code>, key <code>PRIMARY</code>, 1 row.</p>`,
          },
          {
            title: 'Extra: Using filesort', short: 'filesort',
            sql: 'EXPLAIN SELECT name, price FROM products ORDER BY price DESC;',
            body: `<p><code>Using filesort</code> means MySQL must sort the rows itself after reading them. That happens in memory, or on disk if the sort is big.</p>
              <p>An index on <code>price</code> would hand rows over already sorted. On 8 rows it doesn't matter; on 8 million it does.</p>`,
          },
          {
            title: 'Extra: Using temporary', short: 'temporary',
            sql: 'EXPLAIN SELECT category, COUNT(*) FROM products GROUP BY category;',
            body: `<p>To group without a suitable index, MySQL builds a <b>temporary table</b> keyed by category and counts into it.</p>
              <p>An index on the GROUP BY column lets MySQL read groups in order instead.</p>`,
          },
          {
            title: 'EXPLAIN a JOIN', short: 'JOIN plan',
            sql: 'EXPLAIN SELECT c.name, o.quantity\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nWHERE o.product_id = 4;',
            body: `<p>Read a join plan <b>top to bottom as nested loops</b>:</p>
              <ol><li><code>o</code> via index <code>product_id</code> (type <code>ref</code>) finds the 2 orders for product 4.</li>
              <li>For <b>each</b> of them, <code>c</code> via <code>PRIMARY</code> (type <code>eq_ref</code>) fetches exactly 1 customer.</li></ol>
              <p>Rows examined ≈ 2 × 1. Multiply down the <code>rows</code> column to estimate the work.</p>`,
          },
          {
            title: 'Spot the problem', short: 'Bad join',
            sql: 'EXPLAIN SELECT c.name, o.id\nFROM customers c\nJOIN orders o ON o.ordered_on = c.joined_on;',
            body: `<p>Neither <code>ordered_on</code> nor <code>joined_on</code> has an index, so both tables show <code>ALL</code>, and MySQL compares every customer with every order: <b>8 × 12 = 96</b> combinations.</p>
              <p><code>Using join buffer (hash join)</code> is MySQL 8 softening the blow. With a million rows on each side, it still hurts.</p>`,
            key: 'Two ALLs in one join plan: add an index on the join column of the inner table.',
          },
          {
            title: 'ANALYZE TABLE: fresh statistics', short: 'ANALYZE',
            sql: 'ANALYZE TABLE products, orders;\nSHOW INDEX FROM orders;',
            body: `<p>The <code>rows</code> estimates in EXPLAIN come from <b>statistics</b>: how many rows a table has, and how many distinct values each index holds (its <b>Cardinality</b>).</p>
              <p><code>ANALYZE TABLE</code> recalculates them. InnoDB also does this automatically after about 10% of a table changes, so run it by hand after a big bulk load, or when EXPLAIN's guesses look badly wrong.</p>`,
          },
          {
            title: 'Your turn: fix the join', short: 'Challenge',
            sql: "-- make this join use an index instead of ALL × ALL:\n--   SELECT c.name, o.id FROM customers c JOIN orders o ON o.ordered_on = c.joined_on;\n",
            expect: 'CREATE INDEX idx_ordered_on ON orders (ordered_on);',
            verify: "SELECT EXISTS (SELECT 1 FROM pragma_index_list('orders') il JOIN pragma_index_info(il.name) ii WHERE ii.seqno = 0 AND ii.name = 'ordered_on') OR EXISTS (SELECT 1 FROM pragma_index_list('customers') il JOIN pragma_index_info(il.name) ii WHERE ii.seqno = 0 AND ii.name = 'joined_on')",
            body: `<p>The join from the previous step compares every customer with every order. Add <b>one index</b> so that one side can be looked up instead of scanned.</p>
              <p>Then run the <code>EXPLAIN</code> again in the Editor to confirm.</p>`,
          },
        ],
      },
      {
        id: 'subqueries', title: 'Subqueries vs JOINs', minutes: 14, level: 'Advanced',
        summary: 'Queries inside queries: when they shine, and when a JOIN is better.',
        learn: ['Scalar subqueries in WHERE', '<code>IN (subquery)</code>, and the same thing as a JOIN', 'Correlated subqueries and their cost',
          '<code>EXISTS</code> / <code>NOT EXISTS</code>', 'Derived tables in FROM'],
        steps: [
          {
            title: 'A subquery in WHERE', short: 'Scalar',
            sql: 'SELECT name, price\nFROM products\nWHERE price > (SELECT AVG(price) FROM products);',
            body: `<p>The part in parentheses is a <b>subquery</b>. It runs <b>first</b>, produces one value (the average price), and the outer query then compares every row with it.</p>`,
          },
          {
            title: 'IN (subquery)', short: 'IN',
            sql: 'SELECT name, email\nFROM customers\nWHERE id IN (SELECT customer_id FROM orders WHERE product_id = 1);',
            body: `<p>The subquery returns a <b>list</b>, here the ids of customers who bought product 1. The outer query keeps the customers whose id is in that list.</p>`,
          },
          {
            title: 'The same thing as a JOIN', short: 'As JOIN',
            sql: 'SELECT DISTINCT c.name, c.email\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nWHERE o.product_id = 1;',
            body: `<p>Same answer, written as a JOIN. <code>DISTINCT</code> is needed because a customer who bought product 1 twice would otherwise appear twice.</p>
              <p>MySQL 8 often turns <code>IN (subquery)</code> into a <b>semi-join</b> automatically, so pick whichever reads more clearly, then check EXPLAIN.</p>`,
          },
          {
            title: 'Correlated subquery', short: 'Correlated',
            scene: 'plan',
            sql: 'SELECT name,\n  (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orders\nFROM customers c;',
            body: `<p>This subquery mentions <code>c.id</code> from the <b>outer</b> row, so it can't run once up front. It runs <b>again for every customer</b>. EXPLAIN (Performance module) shows it as a <code>DEPENDENT SUBQUERY</code>.</p>
              <p>With 8 customers that's nothing. With 1 million customers it's 1 million mini-queries, each of which had better use an index (here: <code>customer_id</code>).</p>`,
            key: 'A correlated subquery is a loop. Make sure its inner lookup uses an index, or rewrite it as a JOIN + GROUP BY.',
          },
          {
            title: 'EXISTS / NOT EXISTS', short: 'EXISTS',
            sql: 'SELECT name\nFROM customers c\nWHERE NOT EXISTS (\n  SELECT 1 FROM orders o WHERE o.customer_id = c.id\n);',
            body: `<p><code>EXISTS</code> asks "is there at least one matching row?" and stops at the first match. <code>NOT EXISTS</code> finds rows with <b>no</b> match. Here that's customers who never ordered (Gus).</p>
              <p>It's the same result as the LEFT JOIN … IS NULL anti-join from the JOINs lesson, and often the clearest way to say it.</p>`,
          },
          {
            title: 'Derived tables', short: 'Derived',
            scene: 'plan',
            sql: 'SELECT category, avg_price\nFROM (\n  SELECT category, AVG(price) AS avg_price\n  FROM products\n  GROUP BY category\n) AS t\nWHERE avg_price > 20;',
            body: `<p>A subquery in <code>FROM</code> is a <b>derived table</b>: a temporary result you can query like a table. It must have an alias (<code>AS t</code>).</p>
              <p>EXPLAIN shows it as <code>&lt;derived2&gt;</code>. In MySQL 8 a <b>CTE</b> does the same job more readably: <code>WITH t AS (…) SELECT … FROM t</code>.</p>`,
          },
          {
            title: 'ANY and ALL', short: 'ANY / ALL',
            sql: "SELECT name, price\nFROM products\nWHERE price > ALL (\n  SELECT price FROM products WHERE category = 'Stationery'\n);",
            body: `<p>Compare one value with <b>every</b> value a subquery returns:</p>
              <ul><li><code>&gt; ALL (…)</code>: greater than every one of them, which is the same as greater than the maximum</li>
              <li><code>&gt; ANY (…)</code> (or <code>SOME</code>): greater than at least one, the same as greater than the minimum</li>
              <li><code>= ANY (…)</code> is the same as <code>IN</code>, and <code>&lt;&gt; ALL (…)</code> the same as <code>NOT IN</code></li></ul>`,
          },
          {
            title: 'Which should I use?', short: 'Choosing',
            body: `<ul><li>You need <b>columns from both tables</b>: use a <b>JOIN</b>.</li>
              <li>You're asking "does a match exist?": use <b>EXISTS / NOT EXISTS</b>.</li>
              <li>You're comparing with one computed value (an average or a max): use a <b>scalar subquery</b>.</li>
              <li>You're building an intermediate result: use a <b>derived table or CTE</b>.</li></ul>
              <p>Whichever you write, <b>EXPLAIN</b> it. The optimizer often rewrites one form into another, and EXPLAIN shows what it actually does.</p>`,
            viz: `<div class="model-row" style="max-width:560px">
              <div class="block pop" style="--c:var(--s2)"><b>JOIN</b><small>columns from both sides</small></div>
              <div class="block pop" style="--c:var(--s3);--d:.1s"><b>EXISTS</b><small>“is there any…?”</small></div>
              <div class="block pop" style="--c:var(--s1);--d:.2s"><b>scalar</b><small>compare with one value</small></div>
              <div class="block pop" style="--c:var(--s5);--d:.3s"><b>derived / CTE</b><small>a step-by-step result</small></div></div>`,
          },
          {
            title: 'Your turn: above their category average', short: 'Challenge',
            sql: "-- name, category and price of products priced above\n-- the average price of their OWN category\n",
            expect: 'SELECT name, category, price FROM products p WHERE price > (SELECT AVG(price) FROM products WHERE category = p.category);',
            body: `<p>Find the products that cost more than the <b>average price of their own category</b>. Show <code>name</code>, <code>category</code> and <code>price</code>.</p>
              <p>Hint: a correlated subquery fits, and so does a JOIN to a derived table of category averages.</p>`,
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// New lessons (advanced querying, window functions, schema changes, access control, procedures)
// ---------------------------------------------------------------------------------------------
const SUPPLIERS = `
CREATE TABLE suppliers (id INTEGER NOT NULL PRIMARY KEY, name VARCHAR(60) NOT NULL, city VARCHAR(50));
INSERT INTO suppliers VALUES (1,'Acme Paper','Mumbai'),(2,'Lumen Lights','Berlin'),(3,'KeyCraft','Tokyo'),(4,'MugWorks','Lisbon');
`;
const JOIN_EXTRAS = `
CREATE TABLE staff (id INTEGER NOT NULL PRIMARY KEY, name VARCHAR(50) NOT NULL, manager_id INT REFERENCES staff(id));
INSERT INTO staff VALUES (1,'Maya',NULL),(2,'Omar',1),(3,'Lena',1),(4,'Ravi',2),(5,'Tom',2);
CREATE TABLE sizes (size VARCHAR(5) NOT NULL);
INSERT INTO sizes VALUES ('S'),('M'),('L');
CREATE TABLE colors (color VARCHAR(10) NOT NULL);
INSERT INTO colors VALUES ('red'),('blue'),('black');
`;
const ORDER_DETAILS_VIEW = "CREATE VIEW order_details AS SELECT o.id, c.name AS customer, p.name AS product, o.quantity, p.price * o.quantity AS total FROM orders o JOIN customers c ON c.id = o.customer_id JOIN products p ON p.id = o.product_id;";
const ANALYST = "CREATE USER 'analyst'@'localhost' IDENTIFIED BY 'S3cure!pass';\nGRANT SELECT ON shop.* TO 'analyst'@'localhost';";
const TOP_PRODUCTS = "DELIMITER //\nCREATE PROCEDURE top_products(IN p_limit INT)\nBEGIN\n  SELECT name, price FROM products ORDER BY price DESC LIMIT p_limit;\nEND //\nDELIMITER ;";

const NEW = {
  case: {
    id: 'case', title: 'CASE: If/Else in SQL', minutes: 10, level: 'Intermediate',
    summary: 'Turn values into labels, count by condition, and sort any way you like.',
    learn: ['Searched <code>CASE WHEN … THEN … END</code>', 'Simple CASE on one value', 'CASE inside aggregates (conditional counts)',
      'CASE in ORDER BY', 'Shortcuts: <code>IF()</code>, <code>IFNULL()</code>, <code>COALESCE()</code>'],
    steps: [
      {
        title: 'Label rows with CASE', short: 'CASE',
        sql: "SELECT name, price,\n  CASE\n    WHEN price < 10 THEN 'budget'\n    WHEN price < 50 THEN 'standard'\n    ELSE 'premium'\n  END AS tier\nFROM products;",
        body: `<p><code>CASE</code> is SQL's if/else. MySQL checks the <code>WHEN</code> conditions <b>top to bottom</b>, and the first true one wins. If none match, you get the <code>ELSE</code> value, or NULL when there's no ELSE.</p>
          <p>A Notebook at 6.00 is <i>also</i> under 50, but the first WHEN already matched it.</p>`,
        key: 'Put the most specific WHEN first. Order matters.',
      },
      {
        title: 'Simple CASE: match one value', short: 'Simple',
        sql: "SELECT name, city,\n  CASE city\n    WHEN 'Mumbai' THEN 'India'\n    WHEN 'London' THEN 'UK'\n    ELSE 'Other'\n  END AS country\nFROM customers;",
        body: `<p>When every branch compares the same expression for equality, name it once after <code>CASE</code>.</p>
          <p>Gus's NULL city falls through to <code>ELSE</code>, because NULL never equals anything, not even in a CASE.</p>`,
      },
      {
        title: 'Count by condition', short: 'In aggregates',
        sql: "SELECT\n  SUM(CASE WHEN category = 'Home' THEN stock ELSE 0 END) AS home_stock,\n  SUM(CASE WHEN category = 'Electronics' THEN stock ELSE 0 END) AS electronics_stock,\n  COUNT(CASE WHEN stock = 0 THEN 1 END) AS out_of_stock\nFROM products;",
        body: `<p>A CASE inside an aggregate gives you several counts in <b>one pass</b>. This is how you turn rows into columns (a pivot).</p>
          <p><code>COUNT(CASE WHEN … THEN 1 END)</code> works because rows that don't match produce NULL, and COUNT skips NULLs.</p>`,
      },
      {
        title: 'Custom sort order', short: 'In ORDER BY',
        sql: "SELECT name, city\nFROM customers\nORDER BY CASE WHEN city = 'Mumbai' THEN 0 ELSE 1 END, name;",
        body: `<p>CASE works anywhere an expression is allowed. Here Mumbai customers come first, then everyone else alphabetically.</p>`,
      },
      {
        title: 'Shortcuts: IF, IFNULL, COALESCE', short: 'Shortcuts',
        sql: "SELECT name,\n  IFNULL(city, 'unknown') AS city,\n  IF(joined_on < '2024-04-01', 'early', 'late') AS cohort\nFROM customers;",
        body: `<ul><li><code>IF(cond, a, b)</code>: MySQL's two-way CASE</li>
          <li><code>IFNULL(x, fallback)</code>: replaces a NULL</li>
          <li><code>COALESCE(a, b, c, …)</code>: the first non-NULL value. It's standard SQL, so it works everywhere.</li></ul>`,
      },
      {
        title: 'Your turn: order sizes', short: 'Challenge',
        sql: "-- id, quantity and size: 'bulk' (3 or more), 'pair' (exactly 2), otherwise 'single'\n",
        expect: "SELECT id, quantity, CASE WHEN quantity >= 3 THEN 'bulk' WHEN quantity = 2 THEN 'pair' ELSE 'single' END AS size FROM orders;",
        body: `<p>For every order, show <code>id</code>, <code>quantity</code> and a column <code>size</code> that is <code>'bulk'</code> for 3 or more items, <code>'pair'</code> for exactly 2, and <code>'single'</code> otherwise.</p>`,
      },
    ],
  },
  setOps: {
    id: 'set-ops', title: 'UNION, INTERSECT & EXCEPT', minutes: 12, level: 'Intermediate', setup: SUPPLIERS,
    summary: 'Stack the results of several queries, or compare them.',
    learn: ['Combining results with <code>UNION</code>', '<code>UNION ALL</code> keeps duplicates', '<code>INTERSECT</code>: rows in both',
      '<code>EXCEPT</code>: rows only in the first', 'The rules: matching columns, one ORDER BY'],
    steps: [
      {
        title: 'UNION: stack two results', short: 'UNION',
        sql: 'SELECT city FROM customers\nUNION\nSELECT city FROM suppliers;',
        body: `<p>This lesson adds a small <code>suppliers</code> table. <code>UNION</code> runs both queries and stacks the rows, <b>dropping duplicates</b>: Mumbai appears once even though three people live there.</p>`,
      },
      {
        title: 'UNION ALL keeps everything', short: 'UNION ALL',
        sql: 'SELECT city FROM customers\nUNION ALL\nSELECT city FROM suppliers;',
        body: `<p><code>UNION ALL</code> skips the duplicate check: 8 + 4 = 12 rows.</p>`,
        key: 'UNION ALL is faster because it never has to compare rows. Use it unless you actually need duplicates removed.',
      },
      {
        title: 'Label where rows came from', short: 'Labels',
        sql: "SELECT name, 'customer' AS kind FROM customers\nUNION ALL\nSELECT name, 'supplier' FROM suppliers\nORDER BY name;",
        body: `<p>A constant column tags each part. The column names come from the <b>first</b> SELECT, and one <code>ORDER BY</code> at the very end sorts the combined result.</p>`,
      },
      {
        title: 'INTERSECT: in both', short: 'INTERSECT',
        sql: 'SELECT city FROM customers\nINTERSECT\nSELECT city FROM suppliers;',
        body: `<p><code>INTERSECT</code> keeps only rows that appear in <b>both</b> results: the cities where we have a customer and a supplier.</p>
          <p><i>Needs MySQL 8.0.31 or newer. On older versions, use <code>IN (subquery)</code> or a JOIN.</i></p>`,
      },
      {
        title: 'EXCEPT: only in the first', short: 'EXCEPT',
        sql: 'SELECT city FROM customers\nEXCEPT\nSELECT city FROM suppliers;',
        body: `<p><code>EXCEPT</code> keeps rows from the first result that <b>don't</b> appear in the second: customer cities with no supplier.</p>
          <p>Notice that NULL survives. Set operations treat two NULLs as equal, unlike <code>=</code> does.</p>`,
      },
      {
        title: 'The rules', short: 'Rules',
        body: `<ul><li>Every SELECT must return the <b>same number of columns</b>, with compatible types (otherwise error 1222).</li>
          <li>Names come from the first SELECT.</li><li>One ORDER BY / LIMIT at the end applies to the whole result. Wrap a part in parentheses to sort it on its own.</li></ul>
          <p><b>JOIN vs UNION:</b> a JOIN puts tables side by side and adds <i>columns</i>. A UNION stacks results and adds <i>rows</i>.</p>`,
        viz: `<div class="model-row">
          <div class="slab pop code" style="--c:var(--s2)"><div class="slab-title">JOIN → wider</div><pre>name     | product
Asha Rao | Keyboard</pre><small>columns from both tables</small></div>
          <div class="slab pop code" style="--c:var(--s3);--d:.2s"><div class="slab-title">UNION → taller</div><pre>city
Mumbai     ← customers
Lisbon     ← suppliers</pre><small>rows from both queries</small></div></div>`,
      },
      {
        title: 'Your turn: every city we touch', short: 'Challenge',
        sql: '-- every city with a customer or a supplier: no duplicates, no NULL\n',
        expect: 'SELECT city FROM customers WHERE city IS NOT NULL UNION SELECT city FROM suppliers ORDER BY city;',
        body: `<p>List every <code>city</code> where we have a customer <b>or</b> a supplier, each city once, with no NULL, in alphabetical order.</p>`,
      },
    ],
  },
  moreJoins: {
    id: 'more-joins', title: 'More JOIN Types', minutes: 12, level: 'Intermediate', setup: JOIN_EXTRAS,
    summary: 'RIGHT, FULL (MySQL style), CROSS and self joins.',
    learn: ['<code>RIGHT JOIN</code>, and why LEFT is preferred', 'All join types as Venn diagrams', 'FULL OUTER JOIN emulated with UNION',
      '<code>CROSS JOIN</code>: every combination', 'Self joins: a table joined to itself'],
    steps: [
      {
        title: 'RIGHT JOIN', short: 'RIGHT',
        sql: 'SELECT c.name, o.id AS order_id\nFROM orders o\nRIGHT JOIN customers c ON c.id = o.customer_id;',
        body: `<p><code>RIGHT JOIN</code> keeps every row of the <b>right</b> table (customers), with NULLs where nothing matches. Gus shows up with no order.</p>
          <p>It's a LEFT JOIN with the tables swapped, and most people write it that way because it reads left to right.</p>`,
      },
      {
        title: 'The join family', short: 'Venn',
        body: `<p>Think of each table as a circle. The join type decides which parts you keep:</p>
          <ul><li><b>INNER</b>: only the overlap (rows that match)</li><li><b>LEFT</b>: all of the left table, plus matches</li>
          <li><b>RIGHT</b>: all of the right table, plus matches</li><li><b>FULL OUTER</b>: everything from both sides</li></ul>`,
        viz: `<div class="model-row">
          <div class="venn pop"><div class="pair"><i></i><i></i><b></b></div>INNER JOIN<small>overlap only</small></div>
          <div class="venn left pop" style="--d:.1s"><div class="pair"><i></i><i></i><b></b></div>LEFT JOIN<small>all left + matches</small></div>
          <div class="venn right pop" style="--d:.2s"><div class="pair"><i></i><i></i><b></b></div>RIGHT JOIN<small>all right + matches</small></div>
          <div class="venn full pop" style="--d:.3s"><div class="pair"><i></i><i></i><b></b></div>FULL OUTER<small>everything (not in MySQL)</small></div></div>`,
      },
      {
        title: 'FULL OUTER JOIN, MySQL style', short: 'FULL',
        sql: 'SELECT c.name, o.id AS order_id\nFROM customers c LEFT JOIN orders o ON o.customer_id = c.id\nUNION\nSELECT c.name, o.id\nFROM customers c RIGHT JOIN orders o ON o.customer_id = c.id;',
        body: `<p>MySQL has <b>no FULL OUTER JOIN</b>; try it in the Editor and you get error 1064. Instead, combine a LEFT JOIN and a RIGHT JOIN with <code>UNION</code>, which removes the matched rows that appear in both.</p>
          <p>(UNION is covered fully in the Advanced Querying module.)</p>`,
      },
      {
        title: 'CROSS JOIN: every combination', short: 'CROSS',
        sql: 'SELECT s.size, c.color\nFROM sizes s\nCROSS JOIN colors c;',
        body: `<p>A <code>CROSS JOIN</code> pairs every row with every row: 3 sizes × 3 colors = 9 T-shirt variants. There's no ON clause.</p>
          <p>Watch out: the old comma syntax <code>FROM a, b</code> with a forgotten WHERE is an accidental cross join. 10,000 × 10,000 rows = 100 million.</p>`,
      },
      {
        title: 'Self join: a table meets itself', short: 'Self',
        sql: 'SELECT e.name AS employee, m.name AS manager\nFROM staff e\nLEFT JOIN staff m ON m.id = e.manager_id;',
        body: `<p>The <code>staff</code> table stores each person's <code>manager_id</code>, which points at another row of the <b>same</b> table.</p>
          <p>Two aliases (<code>e</code> for employee, <code>m</code> for manager) let you join it to itself. Maya has no manager, so the LEFT JOIN keeps her with NULL.</p>`,
      },
      {
        title: 'Your turn: team sizes', short: 'Challenge',
        sql: '-- each manager’s name and how many direct reports they have (as reports)\n',
        expect: 'SELECT m.name, COUNT(*) AS reports FROM staff e JOIN staff m ON m.id = e.manager_id GROUP BY m.id, m.name;',
        body: `<p>For every staff member who manages someone, show their <code>name</code> and the number of people reporting directly to them as <code>reports</code>.</p>`,
      },
    ],
  },
  windowBasics: {
    id: 'window-basics', title: 'OVER & PARTITION BY', minutes: 14, level: 'Intermediate',
    summary: 'Aggregates that keep every row: per-group totals, running totals and moving averages.',
    learn: ['<code>OVER ()</code>: an aggregate that keeps every row', '<code>PARTITION BY</code>: one window per group', 'Comparing a row with its window',
      'Running totals with <code>ORDER BY</code> in OVER', 'Frames: <code>ROWS BETWEEN …</code>'],
    steps: [
      {
        title: 'GROUP BY squashes, windows keep', short: 'Why',
        body: `<p><code>GROUP BY</code> collapses each group into one row, so you lose the details. A <b>window function</b> computes the same kind of value but <b>keeps every row</b>: each product can see its category's average next to its own price.</p>
          <p>The magic word is <code>OVER (…)</code>, which says which rows form the "window" for each row.</p>`,
        viz: `<div class="model-row">
          <div class="slab pop code" style="--c:var(--s1)"><div class="slab-title">GROUP BY</div><pre>category    | avg
Electronics | 54.50
Home        | 34.50
Stationery  |  9.00</pre><small>3 rows: details gone</small></div>
          <div class="slab pop code" style="--c:var(--s3);--d:.2s"><div class="slab-title">AVG(price) OVER (PARTITION BY category)</div><pre>Keyboard  89.00 | 54.50
Mouse     29.50 | 54.50
Hub       45.00 | 54.50
Lamp      39.99 | 34.50 …</pre><small>8 rows: every product keeps its row</small></div></div>`,
      },
      {
        title: 'An aggregate over every row', short: 'OVER ()',
        sql: 'SELECT name, price,\n  ROUND(AVG(price) OVER (), 2) AS avg_all\nFROM products;',
        body: `<p><code>OVER ()</code> with nothing inside means the window is <b>all rows</b>. Each row keeps its own values and also sees the overall average.</p>`,
      },
      {
        title: 'PARTITION BY: one window per group', short: 'PARTITION',
        sql: 'SELECT name, category, price,\n  ROUND(AVG(price) OVER (PARTITION BY category), 2) AS avg_in_category\nFROM products;',
        body: `<p><code>PARTITION BY category</code> gives each category its own window. It's like GROUP BY, but the rows stay.</p>`,
      },
      {
        title: 'Every aggregate works', short: 'All aggregates',
        sql: 'SELECT name, category, price,\n  COUNT(*) OVER (PARTITION BY category) AS in_category,\n  MIN(price) OVER (PARTITION BY category) AS cheapest,\n  MAX(price) OVER (PARTITION BY category) AS priciest\nFROM products;',
        body: `<p>All five aggregates (<code>COUNT</code>, <code>SUM</code>, <code>AVG</code>, <code>MIN</code>, <code>MAX</code>) become window functions as soon as you add <code>OVER</code>.</p>
          <p>Several windows can sit in one SELECT. Each fills its own column.</p>`,
      },
      {
        title: 'Compare a row with its window', short: 'Compare',
        sql: 'SELECT name, category, price,\n  ROUND(price - AVG(price) OVER (PARTITION BY category), 2) AS vs_avg\nFROM products;',
        body: `<p>Window results can be used in arithmetic: how far above or below its category average is each product? This is impossible with GROUP BY alone, without a subquery.</p>`,
      },
      {
        title: 'Running totals', short: 'Running',
        sql: 'SELECT id, ordered_on, quantity,\n  SUM(quantity) OVER (ORDER BY ordered_on, id) AS running_items\nFROM orders;',
        body: `<p>Add <code>ORDER BY</code> inside OVER and the window becomes "from the first row <b>up to this one</b>", so SUM turns into a running total.</p>
          <p>Watch the dashed frame grow as the cursor moves down.</p>`,
        key: 'With ORDER BY in OVER, aggregates run cumulatively. Without it, they cover the whole window.',
      },
      {
        title: 'Frames: a moving window', short: 'Frames',
        sql: 'SELECT id, quantity,\n  ROUND(AVG(quantity) OVER (ORDER BY id ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS moving_avg\nFROM orders;',
        body: `<p>A <b>frame</b> picks exactly which rows around the current one count. <code>ROWS BETWEEN 2 PRECEDING AND CURRENT ROW</code> is this row plus the two before it: a 3-row moving average.</p>
          <p>Other bounds: <code>UNBOUNDED PRECEDING</code>, <code>n FOLLOWING</code>, <code>UNBOUNDED FOLLOWING</code>.</p>`,
      },
      {
        title: 'Your turn: customer totals', short: 'Challenge',
        sql: "-- id, customer_id, quantity, and the customer's total quantity over all their orders (customer_total)\n",
        expect: 'SELECT id, customer_id, quantity, SUM(quantity) OVER (PARTITION BY customer_id) AS customer_total FROM orders;',
        body: `<p>For every order, show <code>id</code>, <code>customer_id</code>, <code>quantity</code>, and <code>customer_total</code>: that customer's total quantity across <b>all</b> their orders.</p>`,
      },
    ],
  },
  ranking: {
    id: 'ranking', title: 'Ranking Functions', minutes: 12, level: 'Intermediate',
    summary: 'Number, rank and bucket rows, and find the top N in every group.',
    learn: ['<code>ROW_NUMBER()</code>', '<code>RANK()</code> vs <code>DENSE_RANK()</code> on ties', '<code>PERCENT_RANK()</code> and <code>NTILE()</code>',
      'Top N per group', 'Ranking aggregated results'],
    steps: [
      {
        title: 'ROW_NUMBER: number the rows', short: 'ROW_NUMBER',
        sql: 'SELECT name, category, price,\n  ROW_NUMBER() OVER (PARTITION BY category ORDER BY price DESC) AS rn\nFROM products;',
        body: `<p><code>ROW_NUMBER()</code> numbers the rows 1, 2, 3… inside each window, in the window's ORDER BY. Each category starts again at 1.</p>`,
      },
      {
        title: 'RANK vs DENSE_RANK: ties', short: 'Ties',
        sql: 'SELECT id, quantity,\n  ROW_NUMBER() OVER (ORDER BY quantity DESC) AS row_num,\n  RANK() OVER (ORDER BY quantity DESC) AS rnk,\n  DENSE_RANK() OVER (ORDER BY quantity DESC) AS dense\nFROM orders;',
        body: `<p>Several orders have the same quantity, which are ties:</p>
          <ul><li><code>ROW_NUMBER</code> still gives them different numbers (in no guaranteed order)</li>
          <li><code>RANK</code> gives them the same rank and then <b>skips</b> (1, 2, 3, 3, 3, 6…)</li>
          <li><code>DENSE_RANK</code> gives the same rank with <b>no gaps</b> (1, 2, 3, 3, 3, 4…)</li></ul>`,
        key: 'Sports-style standings use RANK. "Nth highest value" questions use DENSE_RANK.',
      },
      {
        title: 'PERCENT_RANK and NTILE', short: 'Buckets',
        sql: 'SELECT name, price,\n  NTILE(3) OVER (ORDER BY price) AS price_band,\n  ROUND(PERCENT_RANK() OVER (ORDER BY price), 2) AS pct\nFROM products;',
        body: `<p><code>NTILE(3)</code> deals the rows into 3 nearly equal buckets: cheap, mid, expensive. <code>PERCENT_RANK()</code> places each row between 0 (first) and 1 (last).</p>`,
      },
      {
        title: 'Top N per group', short: 'Top N',
        sql: 'SELECT category, name, price\nFROM (\n  SELECT category, name, price,\n    ROW_NUMBER() OVER (PARTITION BY category ORDER BY price DESC) AS rn\n  FROM products\n) AS ranked\nWHERE rn <= 2;',
        body: `<p>The 2 most expensive products <b>in each category</b>, a classic interview question.</p>
          <p>Window functions are computed <b>after</b> WHERE, so you can't write <code>WHERE ROW_NUMBER() … &lt;= 2</code>. Rank in a derived table first, then filter outside.</p>`,
        key: 'Number the rows inside, filter outside.',
      },
      {
        title: 'Your turn: rank customers', short: 'Challenge',
        sql: '-- customer_id, total quantity (total) and a DENSE_RANK by total, highest first (pos)\n',
        expect: 'SELECT customer_id, SUM(quantity) AS total, DENSE_RANK() OVER (ORDER BY SUM(quantity) DESC) AS pos FROM orders GROUP BY customer_id;',
        body: `<p>Rank customers by how many items they've ordered. Show <code>customer_id</code>, their <code>total</code> quantity, and <code>pos</code>: a DENSE_RANK with the biggest total first.</p>
          <p>Hint: a window function can rank the result of a GROUP BY.</p>`,
      },
    ],
  },
  valueFns: {
    id: 'value-functions', title: 'LAG, LEAD & Friends', minutes: 12, level: 'Advanced',
    summary: 'Look at neighbouring rows: previous, next, first, last and Nth.',
    learn: ['<code>LAG()</code>: the previous row', 'Differences between rows', '<code>LEAD()</code>: the next row',
      '<code>FIRST_VALUE()</code> / <code>LAST_VALUE()</code> and the frame trap', '<code>NTH_VALUE()</code>'],
    steps: [
      {
        title: 'LAG: the previous row', short: 'LAG',
        sql: 'SELECT id, ordered_on, quantity,\n  LAG(quantity) OVER (ORDER BY id) AS prev_qty\nFROM orders;',
        body: `<p><code>LAG(x)</code> reads <code>x</code> from the <b>previous</b> row of the window. The first row has no previous row, so it gets NULL.</p>`,
      },
      {
        title: 'Change since last time', short: 'Diff',
        sql: 'SELECT id, quantity,\n  quantity - LAG(quantity, 1, 0) OVER (ORDER BY id) AS diff\nFROM orders;',
        body: `<p><code>LAG(x, offset, default)</code>: look back <i>offset</i> rows, and use <i>default</i> instead of NULL when there's nothing there. Row-to-row differences like this are used everywhere in reporting.</p>`,
      },
      {
        title: 'LEAD: the next row', short: 'LEAD',
        sql: 'SELECT id, customer_id, ordered_on,\n  LEAD(ordered_on) OVER (PARTITION BY customer_id ORDER BY ordered_on, id) AS next_order\nFROM orders;',
        body: `<p><code>LEAD</code> looks <b>forward</b>. Partitioned by customer, it shows when each customer ordered next, or NULL if that was their last order.</p>`,
      },
      {
        title: 'FIRST_VALUE', short: 'FIRST',
        sql: 'SELECT name, category, price,\n  FIRST_VALUE(name) OVER (PARTITION BY category ORDER BY price DESC) AS priciest\nFROM products;',
        body: `<p><code>FIRST_VALUE(x)</code> returns <code>x</code> from the first row of the frame, here the most expensive product in each category.</p>`,
      },
      {
        title: 'The LAST_VALUE trap', short: 'LAST',
        sql: 'SELECT name, category, price,\n  LAST_VALUE(name) OVER (PARTITION BY category ORDER BY price DESC) AS last_default,\n  LAST_VALUE(name) OVER (PARTITION BY category ORDER BY price DESC\n    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS cheapest\nFROM products;',
        body: `<p>With ORDER BY, the default frame stops at the <b>current row</b>. So a plain <code>LAST_VALUE</code> just returns the current row itself (<code>last_default</code>).</p>
          <p>Widen the frame to <code>UNBOUNDED FOLLOWING</code> to get the true last row (<code>cheapest</code>).</p>`,
        key: 'LAST_VALUE almost always needs ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING.',
      },
      {
        title: 'NTH_VALUE', short: 'NTH',
        sql: 'SELECT name, category, price,\n  NTH_VALUE(name, 2) OVER (PARTITION BY category ORDER BY price DESC\n    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS second_priciest\nFROM products;',
        body: `<p><code>NTH_VALUE(x, n)</code> picks the n-th row of the frame: here, the second most expensive product in each category.</p>`,
      },
      {
        title: 'Your turn: the next order', short: 'Challenge',
        sql: "-- id, quantity, and next_qty: the following order's quantity by id (0 for the last order)\n",
        expect: 'SELECT id, quantity, LEAD(quantity, 1, 0) OVER (ORDER BY id) AS next_qty FROM orders;',
        body: `<p>For every order, show <code>id</code>, <code>quantity</code>, and <code>next_qty</code>: the quantity of the <b>next</b> order by id, or <b>0</b> for the last one.</p>`,
      },
    ],
  },
  alter: {
    id: 'alter-table', title: 'ALTER TABLE in Depth', minutes: 15, level: 'Intermediate',
    summary: 'Change live tables: constraints, types, defaults, columns, and emptying them.',
    learn: ['Reading <code>SHOW CREATE TABLE</code>', 'Adding constraints to existing tables', '<code>MODIFY</code> a column’s type',
      'Defaults, renames and dropping columns', 'Dropping constraints, and <code>TRUNCATE</code>'],
    steps: [
      {
        title: 'See the full definition', short: 'SHOW CREATE',
        sql: 'SHOW CREATE TABLE orders;',
        body: `<p><code>SHOW CREATE TABLE</code> prints the exact DDL MySQL would use to rebuild a table, with every key and constraint <b>named</b>.</p>
          <p>Notice <code>orders_ibfk_1</code>: when you don't name a foreign key, MySQL calls it <i>table</i>_ibfk_<i>N</i>. You need these names to drop constraints later.</p>`,
      },
      {
        title: 'Add a constraint later', short: 'ADD CHECK',
        sql: 'ALTER TABLE products\n  ADD CONSTRAINT price_positive CHECK (price > 0);\nSHOW CREATE TABLE products;',
        body: `<p>Constraints can be added to a table that already has data, but MySQL first checks <b>every existing row</b>.</p>
          <p>In the Editor, try <code>CHECK (stock &gt; 0)</code>: the USB-C Hub has 0 in stock, so it fails with error 3819.</p>`,
      },
      {
        title: 'Add keys and defaults later', short: 'ADD PK/FK',
        pre: "CREATE TABLE ratings (\n  product_id INT NOT NULL,\n  author VARCHAR(30) NOT NULL,\n  stars INT NOT NULL\n);\nINSERT INTO ratings VALUES (1, 'ana', 5), (2, 'ana', 4), (1, 'ben', 3);",
        sql: "ALTER TABLE ratings ADD PRIMARY KEY (product_id, author);\nALTER TABLE ratings\n  ADD CONSTRAINT fk_ratings_product\n  FOREIGN KEY (product_id) REFERENCES products(id);\nALTER TABLE ratings ALTER COLUMN stars SET DEFAULT 5;\nSHOW CREATE TABLE ratings;",
        body: `<p>A table that was created without keys can get them later:</p>
          <ul><li><code>ADD PRIMARY KEY (cols)</code>: fails if the existing rows have duplicates or NULLs</li>
          <li><code>ADD CONSTRAINT name FOREIGN KEY (col) REFERENCES t(col)</code>: fails if any row points nowhere (error 1452)</li>
          <li><code>ALTER COLUMN c SET DEFAULT v</code>: changes only the default</li></ul>
          <p>Watch each rule appear on the schema card.</p>`,
      },
      {
        title: 'Add a UNIQUE key', short: 'ADD UNIQUE',
        sql: 'ALTER TABLE customers ADD UNIQUE (email);\nDESCRIBE customers;',
        body: `<p>Now two customers can never share an email. DESCRIBE shows <code>UNI</code> on the column. If duplicates already existed, the ALTER would fail with error 1062 until you cleaned them up.</p>`,
      },
      {
        title: 'MODIFY can fail on existing data', short: 'MODIFY ✗',
        sql: "ALTER TABLE customers\n  MODIFY COLUMN city VARCHAR(80) NOT NULL DEFAULT 'unknown';",
        body: `<p><code>MODIFY COLUMN</code> replaces a column's whole definition: type, NULL-ability, default.</p>
          <p>Gus's city is NULL, so it can't become <code>NOT NULL</code>. MySQL refuses with <b>error 1138: Invalid use of NULL value</b>.</p>`,
      },
      {
        title: 'Fix the data, then MODIFY', short: 'MODIFY ✓',
        sql: "UPDATE customers SET city = 'unknown' WHERE city IS NULL;\nALTER TABLE customers\n  MODIFY COLUMN city VARCHAR(80) NOT NULL DEFAULT 'unknown';\nDESCRIBE customers;",
        body: `<p>Clean the data first, then change the rule. Now <code>city</code> has a new data type length (80 instead of 50), required, and defaults to <code>'unknown'</code>.</p>
          <p>Remember: MODIFY needs the <b>full</b> definition. Anything you leave out, such as NOT NULL or DEFAULT, is dropped.</p>`,
        key: 'Schema migrations usually come in pairs: a data fix, then the ALTER.',
      },
      {
        title: 'Add, rename, drop columns', short: 'Columns',
        sql: 'ALTER TABLE customers ADD COLUMN phone VARCHAR(20);\nALTER TABLE customers RENAME COLUMN phone TO mobile;\nALTER TABLE customers DROP COLUMN mobile;\nDESCRIBE customers;',
        body: `<ul><li><code>ADD COLUMN</code>: new column, NULL for existing rows (or the DEFAULT)</li>
          <li><code>RENAME COLUMN a TO b</code>: keeps the data</li>
          <li><code>DROP COLUMN</code>: the data is gone, and its indexes go with it</li></ul>
          <p><code>ALTER COLUMN x SET DEFAULT v</code> / <code>DROP DEFAULT</code> changes only the default.</p>`,
      },
      {
        title: 'Drop a constraint', short: 'DROP FK',
        sql: 'ALTER TABLE orders DROP FOREIGN KEY orders_ibfk_1;\nDELETE FROM customers WHERE id = 1;\nSELECT o.id, o.customer_id, c.name\nFROM orders o LEFT JOIN customers c ON c.id = o.customer_id\nWHERE c.id IS NULL;',
        body: `<p>Without <code>orders_ibfk_1</code>, nothing stops us deleting Asha, and her three orders become <b>orphans</b> pointing at a customer who no longer exists.</p>
          <p>Use <code>DROP FOREIGN KEY</code>, <code>DROP CHECK</code>, <code>DROP INDEX</code> (for UNIQUE) or the generic <code>DROP CONSTRAINT</code>, always by name.</p>`,
        key: 'Every constraint you drop is a bug you no longer get warned about.',
      },
      {
        title: 'TRUNCATE: empty a table fast', short: 'TRUNCATE',
        pre: "CREATE TABLE logs (id INT AUTO_INCREMENT PRIMARY KEY, msg VARCHAR(50) NOT NULL);\nINSERT INTO logs (msg) VALUES ('boot'), ('login'), ('logout');",
        sql: "TRUNCATE TABLE logs;\nINSERT INTO logs (msg) VALUES ('fresh start');\nSELECT * FROM logs;",
        body: `<p><code>TRUNCATE TABLE</code> removes every row at once: faster than DELETE, and it <b>resets AUTO_INCREMENT</b> (the new row gets id 1).</p>
          <p>It can't be rolled back, and MySQL refuses to truncate a table other tables point at. Try <code>TRUNCATE TABLE customers</code> in the Editor and you get error 1701.</p>`,
      },
      {
        title: 'Your turn: product SKUs', short: 'Challenge',
        sql: '-- add column sku (text, up to 12 characters) to products, and make it UNIQUE\n',
        expect: 'ALTER TABLE products ADD COLUMN sku VARCHAR(12); ALTER TABLE products ADD UNIQUE (sku);',
        verify: "INSERT OR IGNORE INTO products (name, category, price, sku) VALUES ('Tag A', 'Home', 1, 'SKU-1'), ('Tag B', 'Home', 1, 'SKU-1'), ('Tag C', 'Home', 1, 'THIS-SKU-IS-TOO-LONG');\nSELECT name, sku FROM products WHERE name LIKE 'Tag %'",
        body: `<p>Products need a stock-keeping code. Add a column <code>sku</code> holding text of up to <b>12</b> characters to <code>products</code>, and make sure no two products can share a SKU.</p>`,
      },
    ],
  },
  dbViews: {
    id: 'databases-views', title: 'Databases & Views', minutes: 14, level: 'Intermediate',
    summary: 'Many databases on one server, and saved queries you can use like tables.',
    learn: ['<code>SHOW DATABASES</code>, <code>CREATE DATABASE</code>, <code>USE</code>', 'Qualified names: <code>db.table</code>', '<code>DROP DATABASE</code>',
      '<code>CREATE VIEW</code>: a named query', 'Views stay live; managing views'],
    steps: [
      {
        title: 'Many databases, one server', short: 'Databases',
        sql: 'SHOW DATABASES;',
        body: `<p>A MySQL <b>server</b> holds many <b>databases</b> (also called schemas), and each database holds its own tables.</p>
          <p><code>information_schema</code>, <code>mysql</code>, <code>performance_schema</code> and <code>sys</code> are MySQL's own system databases. <code>shop</code> is ours.</p>`,
      },
      {
        title: 'Create and switch', short: 'CREATE / USE',
        sql: "CREATE DATABASE school;\nUSE school;\nCREATE TABLE students (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  name VARCHAR(50) NOT NULL\n);\nINSERT INTO students (name) VALUES ('Zara'), ('Leo');\nSHOW TABLES;",
        body: `<p><code>CREATE DATABASE</code> makes an empty database. <code>USE school</code> makes it the <b>current</b> one: from now on, a bare table name like <code>students</code> means <code>school.students</code>.</p>
          <p><code>SHOW TABLES</code> lists only the current database's tables.</p>`,
      },
      {
        title: 'Reach across databases', short: 'db.table',
        pre: "CREATE DATABASE IF NOT EXISTS school;\nCREATE TABLE IF NOT EXISTS school.students (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL);\nINSERT INTO school.students (name) SELECT 'Zara' WHERE NOT EXISTS (SELECT 1 FROM school.students);",
        scene: 'catalog',
        sql: 'SELECT DATABASE();\nSELECT COUNT(*) AS students FROM school.students;\nSELECT COUNT(*) AS customers FROM shop.customers;',
        body: `<p><code>DATABASE()</code> tells you the current database. A <b>qualified name</b>, <code>database.table</code>, reaches any database regardless of <code>USE</code>.</p>`,
      },
      {
        title: 'DROP DATABASE', short: 'DROP',
        pre: 'CREATE DATABASE IF NOT EXISTS school;',
        sql: 'DROP DATABASE school;\nSHOW DATABASES;',
        body: `<p><code>DROP DATABASE</code> deletes the database <b>and every table in it</b>, instantly and permanently. There's no undo and no rollback.</p>`,
        key: 'Double-check the name before you run DROP DATABASE. Many teams don’t allow it in production at all.',
      },
      {
        title: 'Views: saved queries', short: 'Views',
        body: `<p>A <b>view</b> is a SELECT stored under a name. You query it like a table, but it holds <b>no data</b>: MySQL runs the stored query every time.</p>
          <ul><li><b>Simplify</b>: hide a 3-table join behind one name</li><li><b>Secure</b>: expose some columns, and grant access to the view only</li>
          <li><b>Stabilise</b>: change the tables underneath without changing the view's shape</li></ul>`,
        viz: `<div class="model-row">
          <div class="slab code view pop" style="--c:var(--s1)"><div class="slab-title">VIEW order_details</div><pre>SELECT o.id, c.name, p.name …
FROM orders o
JOIN customers c …
JOIN products p …</pre><small>a saved query: no rows are stored</small></div>
          <span class="flow-arrow">→</span>
          <div class="block pop" style="--c:var(--s2);--d:.2s"><b>SELECT * FROM order_details</b><small>reads like a table</small></div></div>`,
      },
      {
        title: 'Create a view', short: 'CREATE VIEW',
        sql: "CREATE VIEW order_details AS\nSELECT o.id, c.name AS customer, p.name AS product,\n       o.quantity, p.price * o.quantity AS total\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nJOIN products p ON p.id = o.product_id;\nSELECT * FROM order_details WHERE customer = 'Asha Rao';",
        body: `<p>Now anyone can ask for <code>order_details</code> without knowing about the join. The view's columns get the aliases you gave them (<code>customer</code>, <code>product</code>, <code>total</code>).</p>`,
      },
      {
        title: 'Views stay live', short: 'Live',
        pre: ORDER_DETAILS_VIEW,
        sql: "UPDATE products SET price = 99 WHERE id = 1;\nSELECT * FROM order_details WHERE product = 'Mechanical Keyboard';",
        body: `<p>Change the underlying table and the view reflects it immediately, because it re-runs its query on every read. Nothing was copied.</p>`,
      },
      {
        title: 'Managing views', short: 'Manage',
        pre: ORDER_DETAILS_VIEW,
        sql: 'SHOW FULL TABLES;\nDROP VIEW order_details;',
        body: `<p><code>SHOW FULL TABLES</code> marks views as <code>VIEW</code>. Use <code>CREATE OR REPLACE VIEW</code> or <code>ALTER VIEW</code> to change one, and <code>DROP VIEW</code> to remove it (the data underneath is untouched).</p>
          <p><i>In MySQL, simple views are even updatable (you can INSERT/UPDATE through them). This sandbox keeps views read-only.</i></p>`,
      },
      {
        title: 'Your turn: customer spend', short: 'Challenge',
        sql: '-- a view customer_spend with each customer’s name and spent (sum of price × quantity)\n',
        expect: 'CREATE VIEW customer_spend AS SELECT c.name, SUM(p.price * o.quantity) AS spent FROM orders o JOIN customers c ON c.id = o.customer_id JOIN products p ON p.id = o.product_id GROUP BY c.id, c.name;',
        verify: "SELECT name, ROUND(spent, 2) FROM customer_spend UNION ALL SELECT type, NULL FROM sqlite_master WHERE name = 'customer_spend'",
        body: `<p>Create a <b>view</b> named <code>customer_spend</code> with two columns: the customer's <code>name</code> and <code>spent</code>, the sum of price × quantity over all their orders. Only customers who ordered need to appear.</p>`,
      },
    ],
  },
  users: {
    id: 'users-privileges', title: 'Users & Privileges', minutes: 14, level: 'Advanced',
    summary: 'Create accounts and give each one exactly the access it needs.',
    learn: ['Accounts are <code>\'user\'@\'host\'</code>', '<code>CREATE USER</code> and <code>SHOW GRANTS</code>', '<code>GRANT</code> at database and table level',
      'What a denied query looks like', '<code>REVOKE</code> and the principle of least privilege'],
    steps: [
      {
        title: 'Who can do what', short: 'Why',
        body: `<p>So far you've been <code>root</code>, who can do anything. Real applications connect with their <b>own accounts</b>, each holding only the privileges it needs:</p>
          <ul><li>the web app: read and write a few tables</li><li>the analytics team: read only</li><li>a migration tool: change the schema</li></ul>
          <p>If one account is compromised, the damage is limited to what it was allowed to do.</p>`,
        key: 'Principle of least privilege: grant the minimum, and add more only when needed.',
        viz: `<div class="model-row">
          <div class="block pop" style="--c:var(--s-neutral)"><b>root</b><small>everything · admins only</small></div>
          <div class="block pop" style="--c:var(--s2);--d:.15s"><b>shop_app</b><small>SELECT, INSERT, UPDATE on shop</small></div>
          <div class="block pop" style="--c:var(--s3);--d:.3s"><b>analyst</b><small>SELECT only</small></div></div>`,
      },
      {
        title: 'Create a user', short: 'CREATE USER',
        sql: "CREATE USER 'analyst'@'localhost' IDENTIFIED BY 'S3cure!pass';\nSHOW GRANTS FOR 'analyst'@'localhost';",
        body: `<p>An account is a <b>user name plus the host</b> it may connect from: <code>'localhost'</code> means the same machine, and <code>'%'</code> means anywhere.</p>
          <p>A new account has only <code>USAGE</code>: it can log in, and do nothing else.</p>`,
      },
      {
        title: 'GRANT read access', short: 'GRANT',
        pre: "CREATE USER 'analyst'@'localhost' IDENTIFIED BY 'S3cure!pass';",
        sql: "GRANT SELECT ON shop.* TO 'analyst'@'localhost';\nSHOW GRANTS FOR 'analyst'@'localhost';",
        body: `<p><code>GRANT privileges ON what TO whom</code>. <code>shop.*</code> means every table in <code>shop</code>. Watch the matrix fill in.</p>
          <p>Levels: <code>*.*</code> (every database), <code>shop.*</code> (one database), <code>shop.orders</code> (one table).</p>`,
      },
      {
        title: 'Connected as analyst: allowed', short: 'Allowed',
        pre: ANALYST, as: 'analyst@localhost',
        sql: 'SELECT name, city FROM customers;',
        body: `<p>This query runs <b>as analyst</b>. MySQL checks the privileges before touching the data: SELECT on <code>shop.customers</code> is covered by <code>shop.*</code>, so it's allowed.</p>
          <p>In the Editor, use <b>Run as</b> to switch accounts.</p>`,
      },
      {
        title: 'Connected as analyst: denied', short: 'Denied',
        pre: ANALYST, as: 'analyst@localhost',
        sql: 'DELETE FROM orders WHERE id = 12;',
        body: `<p>The analyst has no DELETE privilege, so MySQL refuses with <b>error 1142</b> before anything happens. The order is safe.</p>`,
      },
      {
        title: 'Table-level grants and REVOKE', short: 'REVOKE',
        sql: "CREATE USER 'shop_app'@'%' IDENTIFIED BY 'App#2024!';\nGRANT SELECT, INSERT, UPDATE ON shop.orders TO 'shop_app'@'%';\nGRANT SELECT ON shop.products TO 'shop_app'@'%';\nREVOKE UPDATE ON shop.orders FROM 'shop_app'@'%';\nSHOW GRANTS FOR 'shop_app'@'%';",
        body: `<p>Grants can be as narrow as one table. <code>REVOKE … FROM</code> takes privileges away again.</p>
          <ul><li>Common privileges: <code>SELECT</code>, <code>INSERT</code>, <code>UPDATE</code>, <code>DELETE</code>, <code>CREATE</code>, <code>ALTER</code>, <code>DROP</code>, <code>INDEX</code>, <code>EXECUTE</code>, and <code>ALL PRIVILEGES</code>.</li>
          <li>MySQL 8 also has <b>roles</b> (<code>CREATE ROLE</code>, then <code>GRANT role TO user</code>) to manage teams.</li></ul>
          <p><i>SQL Server's <code>DENY</code> doesn't exist in MySQL. Access is simply whatever was granted, minus what was revoked.</i></p>`,
      },
      {
        title: 'Your turn: a reporting account', short: 'Challenge',
        sql: "-- create 'reporter'@'localhost' (any password) who can only read orders and products\n",
        expect: "CREATE USER 'reporter'@'localhost' IDENTIFIED BY 'x'; GRANT SELECT ON shop.orders TO 'reporter'@'localhost'; GRANT SELECT ON shop.products TO 'reporter'@'localhost';",
        verify: "SHOW GRANTS FOR 'reporter'@'localhost'",
        body: `<p>Create the account <code>'reporter'@'localhost'</code> (any password) that can <b>read</b> the <code>orders</code> and <code>products</code> tables, and nothing else.</p>`,
      },
    ],
  },
  procedures: {
    id: 'procedures', title: 'Stored Procedures', minutes: 16, level: 'Advanced',
    summary: 'Save multi-step logic on the server and run it with CALL.',
    learn: ['<code>DELIMITER</code>, <code>CREATE PROCEDURE</code> and <code>CALL</code>', 'IN and OUT parameters, <code>@variables</code>', '<code>DECLARE</code>, <code>IF</code> and <code>SIGNAL</code>',
      '<code>WHILE</code> loops, and when not to loop', 'Listing and dropping procedures'],
    steps: [
      {
        title: 'Code that lives in the database', short: 'Why',
        body: `<p>A <b>stored procedure</b> is a named block of SQL kept on the server. The application sends one <code>CALL</code> and the server runs all the steps: no back-and-forth over the network.</p>
          <ul><li>shared business rules (every app places orders the same way)</li><li>security: grant <code>EXECUTE</code> on the procedure, not direct table access</li></ul>
          <p>The trade-off: procedures are harder to version, test and debug than application code.</p>`,
        viz: `<div class="model-row flow">
          <div class="block pop" style="--c:var(--s5)"><b>app</b><small>CALL place_order(…)</small></div><span class="flow-arrow">→</span>
          <div class="block pop" style="--c:var(--s3);--d:.15s"><b>MySQL server</b><small>check stock · insert · update</small></div><span class="flow-arrow">→</span>
          <div class="block pop" style="--c:var(--s2);--d:.3s"><b>one reply</b><small>done, or an error</small></div></div>`,
      },
      {
        title: 'Your first procedure', short: 'CREATE',
        sql: TOP_PRODUCTS + '\nCALL top_products(3);',
        body: `<p>The body has its own <code>;</code> characters, so first tell the mysql client to end statements with <code>//</code> instead, using <code>DELIMITER //</code>. Switch back afterwards.</p>
          <p><code>IN p_limit INT</code> is a parameter. <code>CALL top_products(3)</code> runs the body with <code>p_limit = 3</code>.</p>`,
        key: 'Prefix parameters (p_) and variables (v_) so they never clash with column names.',
      },
      {
        title: 'OUT parameters and variables', short: 'OUT',
        sql: "DELIMITER //\nCREATE PROCEDURE customer_stats(IN p_customer INT, OUT p_orders INT, OUT p_items INT)\nBEGIN\n  SELECT COUNT(*), COALESCE(SUM(quantity), 0)\n  INTO p_orders, p_items\n  FROM orders\n  WHERE customer_id = p_customer;\nEND //\nDELIMITER ;\nCALL customer_stats(1, @orders, @items);\nSELECT @orders, @items;",
        body: `<p><code>OUT</code> parameters hand values back. <code>SELECT … INTO</code> stores a query's result in variables.</p>
          <p><code>@orders</code> is a <b>user variable</b>: it lives for your session, so you can read it after the CALL.</p>`,
      },
      {
        title: 'Logic: IF and SIGNAL', short: 'IF / SIGNAL',
        sql: "DELIMITER //\nCREATE PROCEDURE place_order(IN p_customer INT, IN p_product INT, IN p_qty INT)\nBEGIN\n  DECLARE v_stock INT;\n  SELECT stock INTO v_stock FROM products WHERE id = p_product;\n  IF v_stock < p_qty THEN\n    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Not enough stock';\n  END IF;\n  START TRANSACTION;\n  INSERT INTO orders (customer_id, product_id, quantity, ordered_on)\n  VALUES (p_customer, p_product, p_qty, CURRENT_DATE);\n  UPDATE products SET stock = stock - p_qty WHERE id = p_product;\n  COMMIT;\nEND //\nDELIMITER ;\nCALL place_order(2, 6, 3);\nCALL place_order(2, 3, 1);",
        body: `<p><code>DECLARE</code> makes a local variable. <code>IF … THEN … END IF</code> branches. <code>SIGNAL SQLSTATE '45000'</code> raises your own error, which stops the procedure and goes back to the caller as error 1644.</p>
          <p>The first CALL succeeds. The second asks for a USB-C Hub, which has 0 in stock, so it's refused before anything changes.</p>`,
        key: 'Validate first, then change data inside a transaction, so a failure never leaves half an order behind.',
      },
      {
        title: 'Loops: WHILE', short: 'WHILE',
        sql: "DELIMITER //\nCREATE PROCEDURE restock_all(IN p_min INT)\nBEGIN\n  DECLARE v_id INT DEFAULT 1;\n  WHILE v_id <= 8 DO\n    UPDATE products SET stock = GREATEST(stock, p_min) WHERE id = v_id;\n    SET v_id = v_id + 1;\n  END WHILE;\n  SELECT id, name, stock FROM products;\nEND //\nDELIMITER ;\nCALL restock_all(20);",
        body: `<p><code>WHILE cond DO … END WHILE</code> repeats. Watch the procedure visit each product one at a time.</p>
          <p>But SQL is <b>set-based</b>: <code>UPDATE products SET stock = GREATEST(stock, 20)</code> does the same thing in one statement, and much faster on big tables.</p>`,
        key: 'Reach for a loop only when a single set-based statement truly can’t do it.',
      },
      {
        title: 'Listing and dropping', short: 'Manage',
        pre: TOP_PRODUCTS,
        sql: "SHOW PROCEDURE STATUS WHERE Db = 'shop';\nSHOW CREATE PROCEDURE top_products;\nDROP PROCEDURE top_products;",
        body: `<p>List procedures with <code>SHOW PROCEDURE STATUS</code>, read one back with <code>SHOW CREATE PROCEDURE</code>, and remove it with <code>DROP PROCEDURE [IF EXISTS]</code>.</p>
          <p>To change a procedure, drop it and create it again. MySQL also has stored <b>functions</b> (<code>CREATE FUNCTION … RETURNS</code>) and <b>triggers</b>; this sandbox runs procedures only.</p>`,
      },
      {
        title: 'Your turn: an order total', short: 'Challenge',
        sql: '-- procedure order_total(IN p_order INT, OUT p_total DECIMAL(10,2))\n-- sets p_total to price × quantity for that order\n',
        expect: 'DELIMITER //\nCREATE PROCEDURE order_total(IN p_order INT, OUT p_total DECIMAL(10,2))\nBEGIN\n  SELECT p.price * o.quantity INTO p_total FROM orders o JOIN products p ON p.id = o.product_id WHERE o.id = p_order;\nEND //\nDELIMITER ;',
        verify: 'CALL order_total(1, @a); CALL order_total(5, @b); SELECT @a, @b',
        body: `<p>Write a procedure <code>order_total(IN p_order INT, OUT p_total DECIMAL(10,2))</code> that sets <code>p_total</code> to <b>price × quantity</b> for the given order.</p>
          <p>The checker calls it for a couple of orders and compares the results.</p>`,
      },
    ],
  },
};

// The course follows the SQL mind map's branches, each with a friendly name.
const BY_ID = Object.fromEntries(POOL.flatMap((m) => m.lessons).concat(Object.values(NEW)).map((l) => [l.id, l]));
// cats = the mind map's top-level branches this module covers (coloured like the map); tag = its keywords.
// The map files SELECT, EXPLAIN, ANALYZE and stored procedures under DML.
export const BRANCHES = {
  ALIAS: 'Alias (AS)', 'GROUP BY': 'GROUP BY / HAVING', 'ORDER BY': 'ORDER BY ASC / DESC', JOIN: 'INNER, LEFT, RIGHT, FULL, CROSS JOIN',
  FUNCTIONS: 'AVG, SUM, COUNT, MIN, MAX', 'WINDOW FUNCTIONS': 'Aggregate, ranking and value window functions', WHERE: 'Filtering conditions',
  DDL: 'Data Definition Language', DML: 'Data Manipulation Language', DCL: 'Data Control Language', TCL: 'Transaction Control Language',
};
const mod = (title, cats, tag, ids) => ({ title, cats, tag, lessons: ids.map((id) => BY_ID[id]) });
export const MODULES = [
  mod('Foundations', ['DML', 'ALIAS'], 'SELECT · AS · DESCRIBE', ['tables', 'select']),
  mod('Filtering', ['WHERE'], 'COMPARISONS · AND/OR/NOT · IN · LIKE', ['where']),
  mod('Sorting', ['ORDER BY'], 'ASC · DESC · LIMIT', ['order-limit']),
  mod('Summarising', ['FUNCTIONS', 'GROUP BY'], 'COUNT · SUM · AVG · HAVING', ['aggregates', 'group-by']),
  mod('Combining Tables', ['JOIN'], 'INNER · LEFT · RIGHT · CROSS', ['joins', 'more-joins']),
  mod('Advanced Querying', ['DML', 'WHERE'], 'CASE · UNION · EXISTS · ANY/ALL', ['case', 'set-ops', 'subqueries']),
  mod('Window Functions', ['WINDOW FUNCTIONS'], 'OVER · RANK · LAG', ['window-basics', 'ranking', 'value-functions']),
  mod('Changing Data', ['DML'], 'INSERT · UPDATE · DELETE', ['insert', 'update-delete']),
  mod('Transactions', ['TCL'], 'BEGIN · COMMIT · ROLLBACK · SAVEPOINT', ['transactions']),
  mod('Designing Tables', ['DDL'], 'CREATE · ALTER · DROP · TRUNCATE', ['create-table', 'keys-constraints', 'alter-table', 'databases-views', 'normalization']),
  mod('Performance', ['DML'], 'EXPLAIN · ANALYZE · INDEX', ['indexes', 'explain']),
  mod('Access Control', ['DCL'], 'GRANT · REVOKE', ['users-privileges']),
  mod('Stored Procedures', ['DML'], 'PROCEDURE · CALL', ['procedures']),
];
