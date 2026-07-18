import json
import argparse

from elasticsearch import Elasticsearch, helpers


client = Elasticsearch(
    ['http://localhost:9200'],
    request_timeout=1000,
    basic_auth=('', ''),
    verify_certs=False
)


def init_es(es_url: str):
    """Inicializa o cliente Elasticsearch."""
    return Elasticsearch(es_url, verify_certs=False)



def get_data_from_text_file(file):

    # declare an empty list for the data
    data = ""

    # get the data line-by-line using os.open()
    for line in open(file, encoding="utf8", errors='ignore'):

        # append each line of data to the list
        data +=  str(line)

    # return the list of data
    return json.loads(data)

def read_jsonl_in_batches(filepath, batch_size=1000):
    with open(filepath, "r") as f:
        batch = []
        for line in f:
            batch.append(json.loads(line))
            if len(batch) >= batch_size:
                yield batch
                batch = []
        if batch:
            yield batch

def generate_actions_from_file(filepath, index_name):
    total = 0
    for batch in get_data_from_text_file(filepath):
      try:
          r = es.index(index=index_name,id=batch["id"],body=batch)
          print(r)
      except Exception as e:
          print(f"Error: {str(e)}")
          


def index_bulk(es_url, filepath, index_name):
    es = init_es(es_url)
    generate_actions_from_file(filepath, index_name)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Indexa documentos JSONL no Elasticsearch.")
    parser.add_argument("--url", required=True, help="URL do Elasticsearch (ex: http://localhost:9200)",default="http://localhost:9200")
    parser.add_argument("--file", required=True, help="Caminho do arquivo .jsonl",default="all2.json")
    parser.add_argument("--index", required=True, help="Nome do índice",default="tweets")

    args = parser.parse_args()
    es = init_es(args.url)
    #print(get_data_from_text_file(args.file))
    #print(generate_actions_from_file(args.file, args.index))
    index_bulk(args.url, args.file,""+args.index)
