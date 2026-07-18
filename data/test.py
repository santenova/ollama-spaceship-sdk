import matplotlib.pyplot as plt
import pandas as pd
import json
from elasticsearch import Elasticsearch


import seaborn as sns  # Add this line to import Seaborn library
# Step 1: Connect to Elasticsearch
es = Elasticsearch([{'scheme':'http','host': 'localhost', 'port': 9200}])
# Step 2: Define the search query with a larger size
query = {
    "size": 1000,  # Increase the size to fetch more documents
    "_source": ["created_date", "updated_date", "session_name", "model_name", "provider", 
               "endpoint", "score", "correct", "wrong", "false_positives", "false_negatives", 
               "duration_seconds", "time_per_query", "performance_score", "energy_efficiency", 
               "model_size_mb", "total_tokens", "prompt_tokens", "completion_tokens", 
               "estimated_cost_usd", "error_count", "last_error", "status", "is_archived", 
               "drift_ratio", "drift_percentage", "gdpr_compliant", "test_results", 
               "capabilities.strengths", "capabilities.weaknesses", "capabilities.best_use_cases", 
               "capabilities.performance_profile", "capabilities.deployment_recommendation", 
               "capabilities.overall_rating"]
}
# Step 3: Execute the search query
response = es.search(index="prompt-hub-test-result", body=query)
hits = response['hits']['hits']
# Check if any hits were returned
if not hits:
    print("No documents found in the specified index.")
else:
    # Create a list to store the fetched data
    data_list = []
    # Define a mapping of field names to their desired values
    field_mapping = {
        'created_date': None,
        'updated_date': None,
        'session_name': None,
        'model_name': None,
        'provider': None,
        'endpoint': None,
        'score': None,
        'correct': None,
        'wrong': None,
        'false_positives': None,
        'false_negatives': None,
        'duration_seconds': None,
        'time_per_query': None,
        'performance_score': None,
        'energy_efficiency': None,
        'model_size_mb': None,
        'total_tokens': None,
        'prompt_tokens': None,
        'completion_tokens': None,
        'estimated_cost_usd': None,
        'error_count': None,
        'last_error': None,
        'status': None,
        'is_archived': None,
        'drift_ratio': None,
        'drift_percentage': None,
        'gdpr_compliant': None,
        'test_results': None,
        'capabilities.strengths': [],
        'capabilities.weaknesses': [],
        'capabilities.best_use_cases': [],
        'capabilities.performance_profile': None,
        'capabilities.deployment_recommendation': None,
        'capabilities.overall_rating': None
    }

    data_list = []

    # Iterate through the search results and extract the desired fields
    for hit in hits:
        _source = hit['_source']

        # Extract the required information from each document
        session_name = _source.get('session_name', None)
        model_name = _source.get('model_name', None)  # Ensure this is not missing
        provider = _source.get('provider', None)
        endpoint = _source.get('endpoint', None)
        score = _source.get('score', None)
        correct = _source.get('correct', None)
        wrong = _source.get('wrong', None)
        time_per_query = _source.get('time_per_query', None)

        # Append the extracted data to the list
        data_list.append({
            'session_name': session_name,
            'model_name': model_name,  # Include model_name in the dictionary
            'provider': provider,
            'endpoint': endpoint,
            'score': score,
            'correct': correct,
            'wrong': wrong,
            'time_per_query': time_per_query
        })

    # Create a DataFrame from the fetched data
    df = pd.DataFrame(data_list)
    
    # Prepare data for plotting (assuming you want to plot performance_score vs time_per_query)
    performances = df['score']
    times = df['time_per_query']

    # Plotting
    plt.figure(figsize=(12, 6))
    plt.plot(times, performances, marker='o', linestyle='-', color='b')
    plt.title('Performance vs Time per Query')
    plt.xlabel('Performance Score')
    plt.ylabel('Time per Query (seconds)')
    plt.grid(True)
    plt.show()






def plot_performance_vs_time_per_query(index='prompt-hub-test-result'):
    # Step 2: Define the search query with a larger size
    query = {
        "size": 1000,  # Increase the size to fetch more documents
        "_source": [field for field in field_mapping if field_mapping[field] is not None],  # Include only desired fields in _source
        "_source_includes": ["created_date", "updated_date", "session_name", "model_name", "provider", 
                            "endpoint", "score", "correct", "wrong", "false_positives", "false_negatives", 
                            "duration_seconds", "time_per_query", "performance_score", "energy_efficiency", 
                            "model_size_mb", "total_tokens", "prompt_tokens", "completion_tokens", 
                            "estimated_cost_usd", "error_count", "last_error", "status", "is_archived", 
                            "drift_ratio", "drift_percentage", "gdpr_compliant", "test_results", 
                            "capabilities.strengths", "capabilities.weaknesses", "capabilities.best_use_cases", 
                            "capabilities.performance_profile", "capabilities.deployment_recommendation", 
                            "capabilities.overall_rating"]
    }
    # Step 3: Execute the search query
    response = es.search(index=index, body=query)
    hits = response['hits']['hits']
    if not hits:
        print("No documents found in the specified index.")
    else:
        data_list = []  # Create an empty list to store the fetched data
        for hit in hits:
            _source = hit['_source']
            session_name = _source.get('session_name', None)
            model_name = _source.get('model_name', None)  # Ensure this is not missing
            provider = _source.get('provider', None)
            endpoint = _source.get('endpoint', None)
            score = _source.get('score', None)
            correct = _source.get('correct', None)
            wrong = _source.get('wrong', None)
            time_per_query = _source.get('time_per_query', None)

            data_list.append({
                'session_name': session_name,
                'model_name': model_name,  # Include model_name in the dictionary
                'provider': provider,
                'endpoint': endpoint,
                'score': score,
                'correct': correct,
                'wrong': wrong,
                'time_per_query': time_per_query
            })

        # Create a DataFrame from the fetched data
        df = pd.DataFrame(data_list)
        print(df.info())
        performances = df['score']  # Performance scores column
        model_names = df['model_name']

        # Plotting for model name and performance
        plt.figure(figsize=(12, 6))
        sns.barplot(x=df['model_name'], y=performances, rot=90)
        plt.title('Performance vs Model Name')
        plt.ylabel('Performance Score')
        plt.grid(True)
        plt.show()

        # Plotting for performance and time per query
        performances = df['score']  # Performance scores column
        times = df['time_per_query']  # Time per query column

        # Plotting
        plt.figure(figsize=(12, 6))
        plt.plot(times, performances, marker='o', linestyle='-', color='b')
        plt.title('Performance vs Time per Query')
        plt.xlabel('Performance Score')
        plt.ylabel('Time per Query (seconds)')
        plt.grid(True)
        plt.show()

    return df, performances, times  # Return the DataFrame and plotting data for further analysis

if __name__ == '__main__':
    df, performance_scores, time_per_queries = plot_performance_vs_time_per_query(index='prompt-hub-test-result')
    # Save the results 
