import api from '../services/axiosInstance'

const backend_URL = 'http://localhost:3000/api'

export async function fetchAllProducts() {
    return api
          .get(`${backend_URL}/product/getAll`)
          .then((response) => {
            console.log("All items retrieved from the backend.")
            console.log(response.data)
            console.log(response.data.allProducts)
            return response.data.allProducts
          })
          .catch((error) => {
            console.error(error)
          });
}
