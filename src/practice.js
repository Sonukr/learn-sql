// Practice: classic SQL interview questions, each checked against a model answer on its own fresh database
// (the shop tables + the tables below). `expect` = model answer; `verify` = how write questions are compared.
// Setup runs straight on SQLite, so it uses SQLite syntax; relative dates use the engine's MySQL functions.
export const PRACTICE_SETUP = `
INSERT INTO products VALUES (9, 'Bookends', 'Home', 15.00, 10);
CREATE TABLE departments (id INTEGER NOT NULL PRIMARY KEY, name VARCHAR(30) NOT NULL);
INSERT INTO departments VALUES (1,'Engineering'),(2,'Sales'),(3,'HR'),(4,'Finance'),(5,'Legal');
CREATE TABLE employees (
  id INTEGER NOT NULL PRIMARY KEY, first_name VARCHAR(30) NOT NULL, last_name VARCHAR(30) NOT NULL,
  department_id INT REFERENCES departments(id), manager_id INT, salary INT NOT NULL, hired_on DATE NOT NULL, birth_date DATE NOT NULL
);
INSERT INTO employees VALUES
 (1,'Asha','Rao',1,NULL,15000,'2019-03-01','1985-04-12'),
 (2,'Ben','Carter',1,1,12000,'2020-06-15','1990-09-30'),
 (3,'Chen','Wei',1,2,9500,date_add(curdate(), -2, 'MONTH'),'1996-01-20'),
 (4,'Diego','Lopez',1,2,9500,'2023-11-01','1994-07-07'),
 (5,'Emma','Schmidt',2,1,11000,'2021-02-01','1988-12-03'),
 (6,'Farah','Khan',2,5,7000,date_add(curdate(), -4, 'MONTH'),'1998-03-15'),
 (7,'Gus','Olsen',2,5,7000,'2022-04-11','1992-05-25'),
 (8,'Hana','Sato',3,1,6500,'2018-09-03','1983-11-11'),
 (9,'Ivan','Petrov',3,8,4801,date_add(curdate(), -1, 'MONTH'),'1999-08-08'),
 (10,'Jia','Li',4,1,8800,'2021-10-05','1991-02-28'),
 (11,'Kofi','Mensah',4,10,7000,date_add(curdate(), -9, 'MONTH'),'1997-06-30'),
 (12,'Lena','Fischer',NULL,1,6000,'2023-01-09','1993-10-10');
CREATE TABLE sales (id INTEGER NOT NULL PRIMARY KEY, sale_date DATE NOT NULL, amount INT NOT NULL);
INSERT INTO sales VALUES (1,'2023-01-10',100),(2,'2023-02-10',120),(3,'2023-03-10',90),(4,'2024-01-10',150),
 (5,'2024-02-10',130),(6,'2024-03-10',170),(7,'2024-03-11',30),(8,'2024-03-12',50),(9,'2024-03-13',40);
CREATE TABLE logins (user_id INT NOT NULL, login_date DATE NOT NULL);
INSERT INTO logins VALUES (1,'2024-07-01'),(1,'2024-07-02'),(1,'2024-07-03'),(1,'2024-07-05'),(1,'2024-07-06'),
 (2,'2024-07-02'),(2,'2024-07-03'),(3,'2024-07-04');
CREATE TABLE purchases (customer_id INT NOT NULL, purchased_on DATE NOT NULL, amount INT NOT NULL);
INSERT INTO purchases VALUES (1,'2024-01-05',40),(1,'2024-02-11',25),(1,'2024-03-02',60),(2,'2024-01-20',15),
 (2,'2024-03-14',30),(3,'2024-01-08',22),(3,'2024-02-19',18),(3,'2024-03-27',45);
CREATE TABLE contacts (id INTEGER NOT NULL PRIMARY KEY, name VARCHAR(50), email VARCHAR(100));
INSERT INTO contacts VALUES (1,'Asha Rao','asha@mail.com'),(2,'Ben Carter','ben@mail.com'),(3,'Asha Rao','asha@mail.com'),
 (4,'Chen Wei','chen@mail.com'),(5,'Ben C.','ben@mail.com'),(6,'  Diego Lopez ','diego@mail.com'),(7,'Emma Schmidt',NULL);
CREATE TABLE contacts_clean (id INTEGER PRIMARY KEY, name VARCHAR(50), email VARCHAR(100));
CREATE TABLE seq (n INT NOT NULL);
INSERT INTO seq VALUES (1),(2),(3),(5),(6),(9);
CREATE TABLE quarterly (product VARCHAR(30) NOT NULL, q1 INT, q2 INT, q3 INT);
INSERT INTO quarterly VALUES ('Keyboard',10,14,9),('Mouse',22,18,25);
CREATE TABLE team_a (name VARCHAR(30) NOT NULL);
CREATE TABLE team_b (name VARCHAR(30) NOT NULL);
INSERT INTO team_a VALUES ('Asha'),('Ben'),('Chen'),('Diego');
INSERT INTO team_b VALUES ('Chen'),('Diego'),('Emma');
CREATE TABLE posts (id INTEGER NOT NULL PRIMARY KEY, body TEXT NOT NULL);
INSERT INTO posts VALUES (1,'sql is fun'),(2,'sql is powerful'),(3,'learn sql');
CREATE TABLE bookings (id INTEGER NOT NULL PRIMARY KEY, room INT NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL);
INSERT INTO bookings VALUES (1,101,'2024-07-01','2024-07-05'),(2,101,'2024-07-04','2024-07-08'),(3,101,'2024-07-08','2024-07-10'),(4,102,'2024-07-01','2024-07-03');
`;

// [topic, question, what to return, model answer, lesson to learn it from, verify (write questions only)]
const Q = [
  ['Ranking', 'Find the second highest salary from the employees table.', 'one column: the salary',
    'SELECT MAX(salary) AS second_highest FROM employees WHERE salary < (SELECT MAX(salary) FROM employees);', 'subqueries'],
  ['Duplicates', 'Find the duplicate records in a table (contacts).', 'name, email, and how many times it appears',
    'SELECT name, email, COUNT(*) AS cnt FROM contacts GROUP BY name, email HAVING COUNT(*) > 1;', 'group-by'],
  ['Duplicates', 'Remove duplicate records from a table (contacts), keeping the lowest id.', 'a DELETE: rows with the same name and email are duplicates',
    'DELETE FROM contacts WHERE id NOT IN (SELECT id FROM (SELECT MIN(id) AS id FROM contacts GROUP BY name, email) t);', 'update-delete', 'SELECT id FROM contacts'],
  ['Ranking', 'Find the top 5 highest salaries.', 'first_name, salary',
    'SELECT first_name, salary FROM employees ORDER BY salary DESC LIMIT 5;', 'order-limit'],
  ['Ranking', 'Find the Nth highest salary (N = 3, counting each salary once).', 'one column: the salary',
    'SELECT DISTINCT salary FROM employees ORDER BY salary DESC LIMIT 1 OFFSET 2;', 'order-limit'],
  ['Aggregation', 'Fetch departments and their total salary expenditure.', 'department name, total salary',
    'SELECT d.name, SUM(e.salary) AS total FROM departments d JOIN employees e ON e.department_id = d.id GROUP BY d.name;', 'joins'],
  ['Dates', 'Find employees who joined in the last 6 months.', 'first_name, hired_on',
    'SELECT first_name, hired_on FROM employees WHERE hired_on >= CURDATE() - INTERVAL 6 MONTH;', 'functions'],
  ['Joins', 'Find employees who are not in any department.', 'first_name',
    'SELECT first_name FROM employees WHERE department_id IS NULL;', 'joins'],
  ['Aggregation', 'Find the total number of employees in each department (include empty ones).', 'department name, employee count',
    'SELECT d.name, COUNT(e.id) AS employees FROM departments d LEFT JOIN employees e ON e.department_id = d.id GROUP BY d.name;', 'joins'],
  ['Pivot', 'Pivot data to show department-wise employee count.', 'one row with columns engineering, sales, hr, finance',
    "SELECT SUM(d.name = 'Engineering') AS engineering, SUM(d.name = 'Sales') AS sales, SUM(d.name = 'HR') AS hr, SUM(d.name = 'Finance') AS finance FROM employees e JOIN departments d ON d.id = e.department_id;", 'case'],
  ['Pivot', 'Unpivot data from a table (quarterly: q1, q2, q3 into rows).', 'product, quarter (q1/q2/q3), amount',
    "SELECT product, 'q1' AS quarter, q1 AS amount FROM quarterly UNION ALL SELECT product, 'q2', q2 FROM quarterly UNION ALL SELECT product, 'q3', q3 FROM quarterly;", 'set-ops'],
  ['Window', 'Find month-over-month revenue growth (sales table).', "month as 'YYYY-MM', revenue, growth = revenue − previous month",
    "WITH m AS (SELECT DATE_FORMAT(sale_date, '%Y-%m') AS month, SUM(amount) AS revenue FROM sales GROUP BY DATE_FORMAT(sale_date, '%Y-%m')) SELECT month, revenue, revenue - LAG(revenue) OVER (ORDER BY month) AS growth FROM m;", 'value-functions'],
  ['Window', 'Find the running total of sales by date.', 'sale_date, amount, running_total',
    'SELECT sale_date, amount, SUM(amount) OVER (ORDER BY sale_date) AS running_total FROM sales;', 'window-basics'],
  ['Advanced', 'Find gaps in a sequence of numbers (seq table).', 'each missing number',
    'WITH RECURSIVE r AS (SELECT MIN(n) AS n FROM seq UNION ALL SELECT n + 1 FROM r WHERE n < (SELECT MAX(n) FROM seq)) SELECT n FROM r WHERE n NOT IN (SELECT n FROM seq);', 'subqueries'],
  ['Window', 'Find the longest streak of consecutive login days for each user.', 'user_id, longest_streak',
    'SELECT user_id, MAX(streak) AS longest_streak FROM (SELECT user_id, COUNT(*) AS streak FROM (SELECT user_id, DATE_SUB(login_date, INTERVAL ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) DAY) AS grp FROM logins) t GROUP BY user_id, grp) s GROUP BY user_id;', 'ranking'],
  ['Aggregation', 'Find the first login date of each user.', 'user_id, first_login',
    'SELECT user_id, MIN(login_date) AS first_login FROM logins GROUP BY user_id;', 'group-by'],
  ['Aggregation', 'Find the last purchase of each customer (purchases table).', 'customer_id, last_purchase date',
    'SELECT customer_id, MAX(purchased_on) AS last_purchase FROM purchases GROUP BY customer_id;', 'group-by'],
  ['Aggregation', 'Find customers who bought in all months (purchases table).', 'customer_id',
    "SELECT customer_id FROM purchases GROUP BY customer_id HAVING COUNT(DISTINCT DATE_FORMAT(purchased_on, '%Y-%m')) = (SELECT COUNT(DISTINCT DATE_FORMAT(purchased_on, '%Y-%m')) FROM purchases);", 'group-by'],
  ['Joins', 'Find products that were never ordered.', 'product name',
    'SELECT p.name FROM products p LEFT JOIN orders o ON o.product_id = p.id WHERE o.id IS NULL;', 'joins'],
  ['Subqueries', 'Find employees earning more than the average salary.', 'first_name, salary',
    'SELECT first_name, salary FROM employees WHERE salary > (SELECT AVG(salary) FROM employees);', 'subqueries'],
  ['Subqueries', 'Find employees earning more than their department average salary.', 'first_name, salary',
    'SELECT first_name, salary FROM employees e WHERE salary > (SELECT AVG(salary) FROM employees x WHERE x.department_id = e.department_id);', 'subqueries'],
  ['Ranking', 'Rank employees within each department by salary (highest = 1).', 'first_name, department_id, salary, rank',
    'SELECT first_name, department_id, salary, RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) AS rnk FROM employees;', 'ranking'],
  ['Ranking', 'Find the top 3 salaries in each department (ties included, use DENSE_RANK).', 'first_name, department_id, salary',
    'SELECT first_name, department_id, salary FROM (SELECT first_name, department_id, salary, DENSE_RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) AS r FROM employees WHERE department_id IS NOT NULL) t WHERE r <= 3;', 'ranking'],
  ['Sets', 'Find common records between two tables (team_a, team_b).', 'name',
    'SELECT name FROM team_a INTERSECT SELECT name FROM team_b;', 'set-ops'],
  ['Sets', 'Find records that are in one table but not in another (in team_a, not team_b).', 'name',
    'SELECT name FROM team_a EXCEPT SELECT name FROM team_b;', 'set-ops'],
  ['Strings', 'Split a full name into first name and last name (customers.name).', 'first_name, last_name',
    "SELECT SUBSTRING_INDEX(name, ' ', 1) AS first_name, SUBSTRING_INDEX(name, ' ', -1) AS last_name FROM customers;", 'functions'],
  ['Strings', 'Concatenate first name and last name into a full name.', 'full_name',
    "SELECT CONCAT(first_name, ' ', last_name) AS full_name FROM employees;", 'functions'],
  ['Dates', 'Extract year, month and day from a date column (employees.hired_on).', 'hired_on, year, month, day',
    'SELECT hired_on, YEAR(hired_on) AS y, MONTH(hired_on) AS m, DAY(hired_on) AS d FROM employees;', 'functions'],
  ['Dates', 'Calculate age from date of birth.', 'first_name, age in whole years',
    'SELECT first_name, TIMESTAMPDIFF(YEAR, birth_date, CURDATE()) AS age FROM employees;', 'functions'],
  ['Dates', 'Find the number of working days (Mon–Fri) in a month: July 2024.', 'one number',
    "WITH RECURSIVE d AS (SELECT DATE('2024-07-01') AS day UNION ALL SELECT day + INTERVAL 1 DAY FROM d WHERE day < LAST_DAY('2024-07-01')) SELECT COUNT(*) AS working_days FROM d WHERE WEEKDAY(day) < 5;", 'functions'],
  ['Subqueries', 'Find employees with the same salary.', 'first_name, salary',
    'SELECT first_name, salary FROM employees WHERE salary IN (SELECT salary FROM employees GROUP BY salary HAVING COUNT(*) > 1);', 'subqueries'],
  ['Ranking', 'Find the highest paid employee in each department.', 'first_name, department_id, salary',
    'SELECT first_name, department_id, salary FROM (SELECT first_name, department_id, salary, RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) AS r FROM employees WHERE department_id IS NOT NULL) t WHERE r = 1;', 'ranking'],
  ['Joins', 'Find all managers and their reporting employees.', 'manager first_name, employee first_name',
    'SELECT m.first_name AS manager, e.first_name AS employee FROM employees e JOIN employees m ON m.id = e.manager_id;', 'more-joins'],
  ['Strings', 'Reverse a string (employees.first_name).', 'first_name, reversed',
    'SELECT first_name, REVERSE(first_name) AS reversed FROM employees;', 'functions'],
  ['Strings', 'Find the frequency of each word in a text column (posts.body).', 'word, how many times it appears',
    "WITH RECURSIVE w AS (SELECT SUBSTRING_INDEX(body, ' ', 1) AS word, SUBSTRING(body, LOCATE(' ', body) + 1) AS rest, LOCATE(' ', body) > 0 AS more FROM posts UNION ALL SELECT SUBSTRING_INDEX(rest, ' ', 1), SUBSTRING(rest, LOCATE(' ', rest) + 1), LOCATE(' ', rest) > 0 FROM w WHERE more) SELECT word, COUNT(*) AS freq FROM w GROUP BY word;", 'functions'],
  ['NULLs', 'Find rows where a column is NULL (contacts.email).', 'the whole row (SELECT *)',
    'SELECT * FROM contacts WHERE email IS NULL;', 'where'],
  ['NULLs', "Replace NULL values with a default value ('no email').", 'name, email',
    "SELECT name, IFNULL(email, 'no email') AS email FROM contacts;", 'functions'],
  ['Strings', 'Trim spaces from the beginning and end of a string (contacts.name).', 'name',
    'SELECT TRIM(name) AS name FROM contacts;', 'functions'],
  ['Aggregation', 'Find the most frequently ordered product (by total quantity).', 'product name, total quantity',
    'SELECT p.name, SUM(o.quantity) AS total_qty FROM orders o JOIN products p ON p.id = o.product_id GROUP BY p.name ORDER BY total_qty DESC LIMIT 1;', 'group-by'],
  ['Window', 'Calculate year-over-year growth (sales table).', 'year, revenue, growth = revenue − previous year',
    'SELECT YEAR(sale_date) AS yr, SUM(amount) AS revenue, SUM(amount) - LAG(SUM(amount)) OVER (ORDER BY YEAR(sale_date)) AS growth FROM sales GROUP BY YEAR(sale_date);', 'value-functions'],
  ['Window', 'Find the moving average of sales (3-row window: this row and the 2 before).', 'sale_date, amount, moving_avg',
    'SELECT sale_date, amount, AVG(amount) OVER (ORDER BY sale_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS moving_avg FROM sales;', 'window-basics'],
  ['Dates', 'Find the difference between two dates in days (bookings).', 'id, nights = end_date − start_date',
    'SELECT id, DATEDIFF(end_date, start_date) AS nights FROM bookings;', 'functions'],
  ['Dates', 'Find overlapping date ranges (bookings of the same room).', 'the two booking ids, smaller first',
    'SELECT a.id, b.id FROM bookings a JOIN bookings b ON a.room = b.room AND a.id < b.id AND a.start_date < b.end_date AND b.start_date < a.end_date;', 'more-joins'],
  ['Ranking', 'Find the second most frequent salary.', 'one column: the salary',
    'SELECT salary FROM (SELECT salary, DENSE_RANK() OVER (ORDER BY COUNT(*) DESC) AS r FROM employees GROUP BY salary) t WHERE r = 2;', 'ranking'],
  ['Filtering', 'Find employees who earn between 10k and 20k.', 'first_name, salary',
    'SELECT first_name, salary FROM employees WHERE salary BETWEEN 10000 AND 20000;', 'where'],
  ['Duplicates', 'Delete records having duplicate values in one column (contacts.email), keeping the lowest id.', 'a DELETE',
    'DELETE FROM contacts WHERE id NOT IN (SELECT id FROM (SELECT MIN(id) AS id FROM contacts GROUP BY email) t);', 'update-delete', 'SELECT id FROM contacts'],
  ['Duplicates', 'Insert only distinct records from another table (contacts → contacts_clean).', 'an INSERT … SELECT of name, email',
    'INSERT INTO contacts_clean (name, email) SELECT DISTINCT name, email FROM contacts;', 'insert', 'SELECT name, email FROM contacts_clean'],
  ['Changing data', 'Update salary by 10% for a specific department (Sales, id 2).', 'an UPDATE',
    'UPDATE employees SET salary = salary * 1.10 WHERE department_id = 2;', 'update-delete', 'SELECT id, salary FROM employees'],
  ['Strings', 'Find employee names in UPPERCASE and lowercase.', 'upper_name, lower_name (from first_name)',
    'SELECT UPPER(first_name) AS upper_name, LOWER(first_name) AS lower_name FROM employees;', 'functions'],
  ['Dates', 'Generate a series of dates between two given dates (2024-07-01 to 2024-07-07).', 'one column: each date',
    "WITH RECURSIVE d AS (SELECT DATE('2024-07-01') AS day UNION ALL SELECT day + INTERVAL 1 DAY FROM d WHERE day < '2024-07-07') SELECT day FROM d;", 'subqueries'],
  ['Filtering', 'Find whether each salary is odd or even.', "employee id, salary, 'Even' or 'Odd'",
    "SELECT id, salary, CASE WHEN salary % 2 = 0 THEN 'Even' ELSE 'Odd' END AS salary_type FROM employees;", 'case'],
  ['Duplicates', 'Retrieve distinct records from a table (contacts: name, email).', 'name, email',
    'SELECT DISTINCT name, email FROM contacts;', 'select'],
  ['Aggregation', 'Find the top 3 departments with the highest total salary.', 'department name, total salary',
    'SELECT d.name, SUM(e.salary) AS total FROM departments d JOIN employees e ON e.department_id = d.id GROUP BY d.name ORDER BY total DESC LIMIT 3;', 'group-by'],
];

export const QUESTIONS = Q.map(([topic, q, ret, expect, learn, verify], i) => ({
  id: `q${i + 1}`, no: i + 1, topic, learn,
  title: q, short: `Q${i + 1}`,
  sql: `-- ${q}\n-- Return: ${ret}\n`,
  expect, ...(verify ? { verify } : {}),
  body: `<p><b>Return:</b> ${ret}.</p>`,
}));
export const TOPICS = [...new Set(QUESTIONS.map((x) => x.topic))];
