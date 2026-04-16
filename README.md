# Profile API

This is a simple API that creates and manages user profiles based on a given name. It uses external services to estimate gender, age, and nationality, then stores the result for future use.

The API supports creating a profile, retrieving a single profile, listing profiles with filters, and deleting a profile. If the same name is used again, it returns the existing profile instead of creating a new one.

Built with Node.js, Express, and SQLite.

To run this project, first clone the repository or download the files to your system. Open the project folder in your terminal and install the dependencies by running npm install. After installation, start the server with node index.js or npm start. Once the server is running, you can test the API using tools like Postman or your browser at http://localhost:3000.
