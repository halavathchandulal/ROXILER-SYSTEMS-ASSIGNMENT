const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const axios = require('axios')
const app = express()

app.use(express.json())

const databasePath = './database.db'

let database = null

const initializeDatabase = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    })

    await database.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        price REAL,
        description TEXT,
        category TEXT,
        image TEXT,
        sold BOOLEAN,
        dateOfSale TEXT
      )
    `)

    console.log('Database initialized.')
  } catch (error) {
    console.error('Error initializing database:', error.message)
    process.exit(1)
  }
}

const productsData = [
  {
    id: 1,
    title: 'Fjallraven  Foldsack No 1 Backpack Fits 15 Laptops',
    price: 329.85,
    description:
      'Your perfect pack for everyday use and walks in the forest. Stash your laptop up to 15 inches in the padded sleeve your everyday',
    category: "men's clothing",
    image: 'https://fakestoreapi.com/img/81fPKd-2AYL._AC_SL1500_.jpg',
    sold: false,
    dateOfSale: '2021-11-27T20:29:54+05:30',
  },
  {
    id: 2,
    title: 'Mens Casual Premium Slim Fit TShirts ',
    price: 44.6,
    description:
      'Slimfitting style contrast raglan long sleeve threebutton henley placket light weight  soft fabric for breathable and comfortable wearing. And Solid stitched shirts with round neck made for durability and a great fit for casual fashion wear and diehard baseball fans. The Henley style round neckline includes a threebutton placket.',
    category: "men's clothing",
    image:
      'https://fakestoreapi.com/img/71-3HjGNDUL._AC_SY879._SX._UX._SY._UY_.jpg',
    sold: false,
    dateOfSale: '2021-10-27T20:29:54+05:30',
  },
  {
    id: 3,
    title: 'Mens Cotton Jacket',
    price: 615.89,
    description:
      'great outerwear jackets for SpringAutumnWinter suitable for many occasions such as working hiking camping mountainrock climbing cycling traveling or other outdoors. Good gift choice for you or your family member. A warm hearted love to Father husband or son in this thanksgiving or Christmas Day.',
    category: "men's clothing",
    image: 'https://fakestoreapi.com/img/71li-ujtlUL._AC_UX679_.jpg',
    sold: true,
    dateOfSale: '2022-07-27T20:29:54+05:30',
  },
]

const insertProductsDataIntoDatabase = async () => {
  try {
    const apiUrl =
      'https://s3.amazonaws.com/roxiler.com/product_transaction.json'
    const response = await axios.get(apiUrl)

    if (response.status === 200) {
      const transactions = response.data
      const insertQuery = `
        INSERT INTO products (title, price, description, category, image, sold, dateOfSale)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `

      const existingIds = await database.all('SELECT id FROM products')
      const existingIdSet = new Set(existingIds.map(row => row.id))

      const insertPromises = transactions.map(async product => {
        if (!existingIdSet.has(product.id)) {
          await database.run(insertQuery, [
            product.title,
            product.price,
            product.description,
            product.category,
            product.image,
            product.sold,
            product.dateOfSale,
          ])
        }
      })

      await Promise.all(insertPromises)

      console.log('Product data inserted into the database.')
    }
  } catch (error) {
    console.error('Error inserting product data:', error.message)
  }
}

initializeDatabase()
insertProductsDataIntoDatabase()

app.get('/transactions', (req, res) => {
  const {page = 1, perPage = 10, search = ''} = req.query
  const offset = (page - 1) * perPage
  const limit = parseInt(perPage)

  let query = 'SELECT * FROM transactions'

  if (search) {
    query += ` WHERE title LIKE '%${search}%' OR description LIKE '%${search}%' OR price LIKE '%${search}%'`
  }

  query += ` LIMIT ${limit} OFFSET ${offset}`

  database.all(query, (err, transactions) => {
    if (err) {
      console.error(err)
      res.status(500).send('Internal Server Error')
    } else {
      res.json(transactions)
    }
  })
})

app.get('/statistics', async (req, res) => {
  try {
    const {month} = req.query
    const totalSaleAmountQuery =
      'SELECT SUM(price) AS totalSaleAmount FROM products WHERE strftime("%m", dateOfSale) = ?'
    const totalSoldItemsQuery =
      'SELECT COUNT(*) AS totalSoldItems FROM products WHERE strftime("%m", dateOfSale) = ? AND sold = 1'
    const totalNotSoldItemsQuery =
      'SELECT COUNT(*) AS totalNotSoldItems FROM products WHERE strftime("%m", dateOfSale) = ? AND sold = 0'

    const [
      totalSaleAmountResult,
      totalSoldItemsResult,
      totalNotSoldItemsResult,
    ] = await Promise.all([
      database.get(totalSaleAmountQuery, [month]),
      database.get(totalSoldItemsQuery, [month]),
      database.get(totalNotSoldItemsQuery, [month]),
    ])

    const statistics = {
      totalSaleAmount: totalSaleAmountResult.totalSaleAmount || 0,
      totalSoldItems: totalSoldItemsResult.totalSoldItems || 0,
      totalNotSoldItems: totalNotSoldItemsResult.totalNotSoldItems || 0,
    }

    res.json(statistics)
  } catch (error) {
    console.error('Error retrieving statistics:', error.message)
    res.status(500).json({error: 'Failed to fetch statistics.'})
  }
})

app.get('/bar-chart', async (req, res) => {
  try {
    const {month} = req.query
    const priceRanges = [
      {min: 0, max: 100},
      {min: 101, max: 200},
      {min: 201, max: 300},
      {min: 301, max: 400},
      {min: 401, max: 500},
      {min: 501, max: 600},
      {min: 601, max: 700},
      {min: 701, max: 800},
      {min: 801, max: 900},
      {min: 901, max: Infinity},
    ]

    const barChartData = []
    for (const range of priceRanges) {
      const {min, max} = range
      const query =
        'SELECT COUNT(*) AS count FROM products WHERE strftime("%m", dateOfSale) = ? AND price >= ? AND price <= ?'
      const result = await database.get(query, [month, min, max])
      barChartData.push({
        priceRange: `${min} - ${max}`,
        count: result.count || 0,
      })
    }

    res.json(barChartData)
  } catch (error) {
    console.error('Error retrieving bar chart data:', error.message)
    res.status(500).json({error: 'Failed to fetch bar chart data.'})
  }
})

app.get('/pie-chart', async (req, res) => {
  try {
    const {month} = req.query
    const query =
      'SELECT category, COUNT(*) AS count FROM products WHERE strftime("%m", dateOfSale) = ? GROUP BY category'
    const pieChartData = await database.all(query, [month])
    res.json(pieChartData)
  } catch (error) {
    console.error('Error retrieving pie chart data:', error.message)
    res.status(500).json({error: 'Failed to fetch pie chart data.'})
  }
})

app.get('/combined-data', async (req, res) => {
  try {
    const {month} = req.query
    const [statistics, barChartData, pieChartData] = await Promise.all([
      axios.get(`http://localhost:3000/statistics?month=${month}`),
      axios.get(`http://localhost:3000/bar-chart?month=${month}`),
      axios.get(`http://localhost:3000/pie-chart?month=${month}`),
    ])

    const combinedData = {
      statistics: statistics.data,
      barChartData: barChartData.data,
      pieChartData: pieChartData.data,
    }

    res.json(combinedData)
  } catch (error) {
    console.error('Error combining data:', error.message)
    res.status(500).json({error: 'Failed to combine data.'})
  }
})

const port = 3000
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`)
})
